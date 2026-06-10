const cvInput = document.querySelector("#cvInput");
const jobInput = document.querySelector("#jobInput");
const analyzeBtn = document.querySelector("#analyzeBtn");
const clearBtn = document.querySelector("#clearBtn");
const cvFileInput = document.querySelector("#cvFileInput");
const jobFileInput = document.querySelector("#jobFileInput");
const cvFileStatus = document.querySelector("#cvFileStatus");
const jobFileStatus = document.querySelector("#jobFileStatus");
const cvFilePreview = document.querySelector("#cvFilePreview");
const jobFilePreview = document.querySelector("#jobFilePreview");
const results = document.querySelector("#results");
const toast = document.querySelector("#toast");
const historyList = document.querySelector("#historyList");
const historyEmpty = document.querySelector("#historyEmpty");
const downloadTxtBtn = document.querySelector("#downloadTxtBtn");
const downloadDocxBtn = document.querySelector("#downloadDocxBtn");
const HISTORY_KEY = "facebookCvAssistantHistory";
let currentAdaptedCvText = "";

const skillKeywords = [
  "excel", "ventas", "atencion a clientes", "atencion al cliente", "caja", "facturacion",
  "administracion", "inventarios", "almacen", "logistica", "reclutamiento", "nomina",
  "contabilidad", "marketing", "redes sociales", "diseno", "photoshop", "canva",
  "javascript", "react", "html", "css", "sql", "python", "ingles", "liderazgo",
  "manejo de personal", "chofer", "licencia", "crm", "sap", "office", "word",
  "powerpoint", "comunicacion", "proactivo", "responsable", "puntual", "organizado"
];

const suspiciousPatterns = [
  { severity: "red", test: /deposito|dep[oó]sito|anticipo|pago inicial|cuota|inversion|inversi[oó]n|recuperable/i, text: "Piden dinero, depósito, anticipo o inversión. Una vacante real no debería cobrarte por aplicar." },
  { severity: "red", test: /\b(?:ine|identificacion|identificaci[oó]n|curp|rfc)\b.*(?:antes|previo|primero|urgente|whatsapp|wsp|inbox)|(?:manda|envia|envía|comparte).{0,30}\b(?:ine|identificacion|identificaci[oó]n|curp|rfc)\b/i, text: "Piden INE o documentos personales antes de una entrevista formal." },
  { severity: "red", test: /datos bancarios|cuenta bancaria|clabe|tarjeta bancaria|numero de tarjeta|n[uú]mero de tarjeta|estado de cuenta|nip/i, text: "Piden datos bancarios. No compartas cuentas, CLABE, tarjetas ni NIP por una publicación." },
  { severity: "yellow", test: /visa|viaje|extranjero|canad[aá]|estados unidos|usa|europa|boletos|pasaporte/i, text: "Prometen visa o viaje. Verifica empresa legalmente establecida, contrato y proceso oficial." },
  { severity: "yellow", test: /gana\s+\$?\d{4,}.*(diario|por dia|por d[ií]a)|ingresos.*sin experiencia.*altos/i, text: "Prometen ingresos muy altos con poca información." },
  { severity: "yellow", test: /inbox\s+info|manda\s+mensaje\s+para\s+info|informes\s+solo\s+inbox/i, text: "Ocultan detalles importantes y piden contacto privado de inmediato." },
  { severity: "yellow", test: /no\s+entrevista|contratacion\s+inmediata.*sin|contrataci[oó]n\s+inmediata.*sin/i, text: "Ofrecen contratación sin proceso claro." },
  { severity: "yellow", test: /prestamo|pr[eé]stamo|credito|cr[eé]dito|tarjeta|financiamiento/i, text: "La publicación menciona préstamos o créditos; revisa que sea empleo real." }
];

const stopWords = new Set([
  "para", "con", "sin", "por", "una", "uno", "los", "las", "del", "que", "como",
  "esta", "este", "son", "mas", "muy", "sus", "tus", "debe", "tener", "busca",
  "solicita", "vacante", "empleo", "trabajo", "zona", "lunes", "viernes"
]);

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s$@.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function firstMatch(text, patterns, fallback = "") {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return fallback;
}

function extractCompany(rawJob) {
  const company = firstMatch(rawJob, [
    /(?:empresa|compañía|compania|grupo|corporativo|consultoría|consultoria|agencia|marca)\s*[:.-]?\s*([A-ZÁÉÍÓÚÜÑ0-9][\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,60}?)(?=\s+(?:solicita|solicitamos|busca|buscamos|contrata|contratamos|requiere|vacante)\b|[.,\n|]|$)/i,
    /(?:somos|para)\s+([A-ZÁÉÍÓÚÜÑ0-9][\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,60}?)(?=\s+(?:solicita|solicitamos|busca|buscamos|contrata|contratamos|requiere|vacante)\b|[.,\n|]|$)/i,
    /([A-ZÁÉÍÓÚÜÑ0-9][\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,45}\s+(?:S\.?\s*A\.?|SA de CV|SAPI|S de RL))/i
  ]);
  return titleCase(cleanFact(company)) || "No aparece";
}

function extractFacts(rawJob) {
  const job = rawJob.replace(/\s+/g, " ").trim();
  const normalized = normalize(rawJob);
  const phone = firstMatch(job, [/(?:\+?52\s?)?(?:\d[\s.-]?){10,13}/]);
  const email = firstMatch(job, [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i]);
  const role = firstMatch(job, [
    /(?:solicito|solicitamos|se solicita|buscamos|contratamos|vacante de|puesto de)\s+([^.,\n|]{3,70})/i,
    /(?:auxiliar|asesor|ejecutivo|vendedor|chofer|contador|recepcionista|administrativo|gerente|cajero|mesero|barista|programador|disenador|diseñador|almacenista|reclutador)[^.,\n|]{0,60}/i
  ]);
  const city = firstMatch(job, [
    /(?:ciudad|ubicacion|ubicación|zona|lugar|sucursal)\s*[:.-]?\s*([^.,\n|]{3,55})/i,
    /(cdmx|ciudad de mexico|monterrey|guadalajara|queretaro|puebla|toluca|tijuana|merida|leon|saltillo|cancun|zapopan|nezahualcoyotl|ecatepec)/i
  ]);
  const salary = firstMatch(job, [
    /(?:sueldo|salario|pago|ofrecemos|ingreso)\s*[:.-]?\s*(\$?\s?\d[\d,.\s]*(?:a|-|hasta)?\s?\$?\s?\d*[\d,.\s]*(?:\s?(?:mensuales|mensual|semanales|semana|diarios|dia|quincenal|netos|brutos))?)/i,
    /\$\s?\d[\d,.\s]*(?:\s?(?:mensuales|mensual|semanales|semana|diarios|dia|quincenal|netos|brutos))?/i
  ]);
  const experience = firstMatch(job, [
    /(?:experiencia)\s*[:.-]?\s*([^.,\n|]{3,80})/i,
    /(\d+\s*(?:anos|año|años|meses)\s+de\s+experiencia[^.,\n|]*)/i,
    /(sin experiencia)/i
  ]);
  const schedule = firstMatch(job, [
    /(?:horario|turno|jornada)\s*[:.-]?\s*([^.,\n|]{3,90})/i,
    /(lunes\s+a\s+viernes[^.,\n|]{0,60})/i,
    /(tiempo\s+completo|medio\s+tiempo|home\s+office|hibrido|presencial)/i
  ]);
  const contact = [phone, email].filter(Boolean).join(" / ") || firstMatch(job, [
    /(?:contacto|informes|whatsapp|wsp|wa)\s*[:.-]?\s*([^.,\n|]{3,90})/i
  ]);

  return {
    role: titleCase(cleanRole(cleanFact(role))) || "No detectado",
    company: extractCompany(rawJob),
    city: titleCase(cleanFact(city)) || "No detectada",
    salary: cleanFact(salary) || "No aparece",
    experience: cleanFact(experience) || "No especificada",
    schedule: cleanFact(schedule) || "No especificado",
    contact: cleanFact(contact) || "No aparece",
    phone: phone ? phone.replace(/[^\d+]/g, "") : "",
    normalized
  };
}

function cleanFact(value) {
  return (value || "")
    .replace(/\b(requisitos?|ofrecemos|horario|sueldo|salario|ubicacion|ubicación|zona|contacto)\b\s*[:.-]?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRole(value) {
  return (value || "")
    .replace(/\s+(?:en|para)\s+(?:cdmx|ciudad de mexico|monterrey|guadalajara|queretaro|puebla|toluca|tijuana|merida|leon|saltillo|cancun|zapopan|nezahualcoyotl|ecatepec)\b.*$/i, "")
    .replace(/\s+(?:sueldo|salario|pago|experiencia|horario|contacto|whatsapp|wsp|requisitos)\b.*$/i, "")
    .trim();
}

function extractMoneyAmounts(text) {
  return [...text.matchAll(/\$?\s?(\d{1,3}(?:[,\s.]\d{3})+|\d{4,6})/g)]
    .map((match) => Number(match[1].replace(/[,\s.]/g, "")))
    .filter((amount) => Number.isFinite(amount));
}

function hasLowExperience(text) {
  const normalized = normalize(text);
  const monthsMatch = normalized.match(/(\d+)\s*mes(?:es)?\s+de\s+experiencia/);
  const yearsMatch = normalized.match(/(\d+)\s*(?:ano|anos|año|años)\s+de\s+experiencia/);
  if (/sin experiencia|no necesitas experiencia|no se requiere experiencia|poca experiencia/.test(normalized)) return true;
  if (monthsMatch && Number(monthsMatch[1]) <= 6) return true;
  if (yearsMatch && Number(yearsMatch[1]) === 0) return true;
  return false;
}

function detectHighSalaryLowExperience(rawJob) {
  const normalized = normalize(rawJob);
  const amounts = extractMoneyAmounts(rawJob);
  if (!amounts.length || !hasLowExperience(rawJob)) return null;
  const highest = Math.max(...amounts);
  const isDaily = /diario|por dia|por d[ií]a/.test(normalized);
  const isWeekly = /semanal|semana/.test(normalized);
  const isMonthly = /mensual|mensuales|mes/.test(normalized);
  const looksTooHigh =
    (isDaily && highest >= 1000) ||
    (isWeekly && highest >= 8000) ||
    (isMonthly && highest >= 35000) ||
    (!isDaily && !isWeekly && !isMonthly && highest >= 30000);

  if (!looksTooHigh) return null;
  return {
    severity: "red",
    text: "El sueldo parece demasiado alto para la poca o nula experiencia solicitada."
  };
}

function extractEmails(text) {
  return [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
}

function detectWeirdEmails(rawJob) {
  const emails = extractEmails(rawJob);
  if (!emails.length) return [];
  const personalDomains = ["gmail.com", "hotmail.com", "outlook.com", "live.com", "yahoo.com", "icloud.com", "proton.me", "protonmail.com"];
  const disposableDomains = ["mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com", "yopmail.com"];

  return emails
    .map((email) => {
      const [local, domain] = email.toLowerCase().split("@");
      if (disposableDomains.includes(domain)) {
        return { severity: "red", text: `El correo ${email} parece temporal o desechable.` };
      }
      if (personalDomains.includes(domain)) {
        return { severity: "yellow", text: `El correo ${email} no parece institucional. Pide confirmar nombre de empresa.` };
      }
      if (/\d{4,}|[_.-]{2,}/.test(local) || domain.split(".")[0].length < 3) {
        return { severity: "yellow", text: `El correo ${email} se ve poco confiable o raro para reclutamiento.` };
      }
      return null;
    })
    .filter(Boolean);
}

function hasCompanyName(rawJob) {
  return /(?:empresa|compa[nñ][ií]a|grupo|corporativo|consultor[ií]a|agencia|restaurante|tienda|sucursal|marca)\s+[\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,}|(?:somos|para)\s+[\wÁÉÍÓÚÜÑáéíóúüñ.& -]{3,}|s\.?\s*a\.?|sapi|s de rl|sa de cv|linkedin|sitio web|www\./i.test(rawJob);
}

function detectSpellingIssues(rawJob) {
  const normalized = normalize(rawJob);
  const misspellings = [
    "travajo", "trabagar", "experiensia", "exelente", "exelentes", "nesecito",
    "necesitams", "interezados", "imbox", "watsap", "whatsap", "wasap",
    "disponivilidad", "resivir", "resibimos", "contratasion", "prestijiosa",
    "solisito", "solisitamos", "elavorada", "honrrado"
  ];
  const hits = misspellings.filter((word) => normalized.includes(word));
  const excessiveNoise = (rawJob.match(/[!?]{2,}/g) || []).length >= 3;
  const tooManyCaps = rawJob.length > 80 && rawJob.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, "").length / rawJob.length > 0.42;

  if (hits.length >= 2 || excessiveNoise || tooManyCaps) {
    return {
      severity: "yellow",
      text: "La publicación tiene muchas faltas, mayúsculas o signos repetidos. Revisa con cuidado antes de compartir datos."
    };
  }
  return null;
}

function evaluateVacancyRisk(rawJob, facts) {
  const normalized = normalize(rawJob);
  const alertItems = suspiciousPatterns
    .filter((item) => item.test.test(rawJob))
    .map(({ severity, text }) => ({ severity, text }));
  const highSalaryAlert = detectHighSalaryLowExperience(rawJob);
  const spellingAlert = detectSpellingIssues(rawJob);
  const companyDetected = hasCompanyName(rawJob);
  const mentionsWhatsapp = /whatsapp|whats|wsp|wa\.me|wa me|\bwa\b/.test(normalized) || Boolean(facts.phone);

  if (highSalaryAlert) alertItems.push(highSalaryAlert);
  if (spellingAlert) alertItems.push(spellingAlert);
  alertItems.push(...detectWeirdEmails(rawJob));

  if (!companyDetected) {
    alertItems.push({
      severity: "yellow",
      text: "No aparece nombre claro de empresa. Pide razón social, sitio web, ubicación y nombre del reclutador."
    });
  }
  if (mentionsWhatsapp && !companyDetected) {
    alertItems.push({
      severity: "yellow",
      text: "Piden WhatsApp personal sin información clara de empresa."
    });
  }
  if (/visa|viaje|extranjero|canad[aá]|estados unidos|usa|europa|boletos|pasaporte/i.test(rawJob) && !companyDetected) {
    alertItems.push({
      severity: "red",
      text: "Prometen visa o viaje sin empresa clara. Puede ser fraude o captación de datos."
    });
  }
  if (!facts.salary || facts.salary === "No aparece") {
    alertItems.push({
      severity: "yellow",
      text: "No aparece sueldo. Pregunta rango salarial antes de avanzar."
    });
  }
  if (!facts.contact || facts.contact === "No aparece") {
    alertItems.push({
      severity: "yellow",
      text: "No hay contacto claro. Pide nombre de empresa, ubicación y proceso."
    });
  }

  const uniqueAlerts = [...new Map(alertItems.map((item) => [item.text, item])).values()];
  const redCount = uniqueAlerts.filter((item) => item.severity === "red").length;
  const yellowCount = uniqueAlerts.filter((item) => item.severity === "yellow").length;
  const riskScore = redCount * 3 + yellowCount;

  if (redCount >= 1 || riskScore >= 5) {
    return {
      alerts: uniqueAlerts,
      risk: {
        level: "red",
        label: "Rojo",
        reason: "Posible fraude: hay señales fuertes de cobro, documentos, datos sensibles o promesas poco claras."
      }
    };
  }
  if (yellowCount >= 1) {
    return {
      alerts: uniqueAlerts,
      risk: {
        level: "yellow",
        label: "Amarillo",
        reason: "Revisar: faltan datos importantes o hay señales que conviene validar."
      }
    };
  }
  return {
    alerts: uniqueAlerts,
    risk: {
      level: "green",
      label: "Verde",
      reason: "Se ve normal: no se detectaron señales fuertes de fraude."
    }
  };
}

function extractRequirements(rawJob) {
  const lines = rawJob
    .split(/\n|•|- |\* /)
    .map((line) => line.trim())
    .filter((line) => line.length > 2);
  const requirementLines = lines.filter((line) =>
    /requisito|experiencia|conocimiento|manejo|licencia|disponibilidad|edad|sexo|escolaridad|bachillerato|licenciatura|indispensable|deseable|excel|ingles|office|ventas|cliente|almacen|caja/i.test(line)
  );
  const keywordRequirements = skillKeywords.filter((keyword) => normalize(rawJob).includes(keyword));
  const merged = [...requirementLines, ...keywordRequirements.map(titleCase)];
  const unique = [...new Map(merged.map((item) => [normalize(item), item])).values()];
  return unique.slice(0, 12);
}

function extractProfileSignals(rawCv) {
  const normalizedCv = normalize(rawCv);
  const words = normalizedCv
    .split(" ")
    .filter((word) => word.length > 3 && !stopWords.has(word));
  const commonSkills = skillKeywords.filter((skill) => normalizedCv.includes(skill));
  const frequency = words.reduce((map, word) => {
    map[word] = (map[word] || 0) + 1;
    return map;
  }, {});
  const topWords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
  return [...new Set([...commonSkills, ...topWords])].slice(0, 12);
}

function analyze(cv, job) {
  const facts = extractFacts(job);
  const requirements = extractRequirements(job);
  const normalizedCv = normalize(cv);
  const normalizedJob = normalize(job);
  const profileSignals = extractProfileSignals(cv);
  const matched = [];
  const missing = [];

  requirements.forEach((requirement) => {
    const normalizedRequirement = normalize(requirement);
    const requirementWords = normalizedRequirement
      .split(" ")
      .filter((word) => word.length > 3 && !stopWords.has(word));
    const hits = requirementWords.filter((word) => normalizedCv.includes(word));
    if (normalizedCv.includes(normalizedRequirement) || hits.length >= Math.max(1, Math.ceil(requirementWords.length * 0.45))) {
      matched.push(requirement);
    } else {
      missing.push(requirement);
    }
  });

  const jobKeywords = [...new Set([
    ...skillKeywords.filter((keyword) => normalizedJob.includes(keyword)),
    ...normalizedJob.split(" ").filter((word) => word.length > 5 && !stopWords.has(word)).slice(0, 25)
  ])];
  const keywordHits = jobKeywords.filter((keyword) => normalizedCv.includes(keyword));
  const reqScore = requirements.length ? matched.length / requirements.length : 0.35;
  const keywordScore = jobKeywords.length ? keywordHits.length / jobKeywords.length : 0.25;
  const infoScore = ["role", "city", "salary", "experience", "schedule", "contact"]
    .filter((key) => !facts[key].startsWith("No ")).length / 6;
  const riskResult = evaluateVacancyRisk(job, facts);
  const alerts = riskResult.alerts.map((item) => item.text);

  let score = Math.round(reqScore * 58 + keywordScore * 30 + infoScore * 12);
  score = Math.max(0, Math.min(100, score));
  if (riskResult.risk.level === "yellow") score = Math.max(0, score - 8);
  if (riskResult.risk.level === "red") score = Math.max(0, score - 18);

  let recommendation = "Pensarlo";
  let reason = "Hay señales útiles, pero conviene validar detalles antes de mandar datos personales.";
  if (riskResult.risk.level === "red") {
    recommendation = "No aplicar";
    reason = "El semáforo está en rojo por señales de posible fraude. No compartas INE, datos bancarios ni dinero.";
  } else if (score >= 72 && riskResult.risk.level === "green") {
    recommendation = "Aplicar";
    reason = "Tu CV coincide bien con la vacante. Aun así, confirma empresa, sueldo y proceso.";
  } else if (score < 45) {
    recommendation = "No aplicar";
    reason = "La compatibilidad es baja o hay demasiadas alertas. Mejor evita compartir información sensible.";
  }

  return {
    facts,
    requirements,
    matched,
    missing,
    alerts,
    risk: riskResult.risk,
    score,
    recommendation,
    reason,
    profileSignals
  };
}

function createMessages(data) {
  const role = data.facts.role === "No detectado" ? "la vacante" : data.facts.role;
  const city = data.facts.city === "No detectada" ? "" : ` en ${data.facts.city}`;
  const matchedText = data.matched.slice(0, 3).join(", ") || data.profileSignals.slice(0, 3).join(", ") || "experiencia relacionada";
  const phoneNote = data.facts.phone ? "" : "No detecté número de WhatsApp en la publicación; usa este texto si te comparten uno.";

  return {
    comment: `Hola, me interesa la vacante de ${role}${city}. Tengo experiencia en ${matchedText}. ¿Me podrían compartir más información del proceso y a dónde envío mi CV?`,
    inbox: `Hola, buen día. Vi su publicación sobre la vacante de ${role}${city} y me interesa postularme.\n\nCuento con experiencia relacionada en ${matchedText}. Me gustaría confirmar si la vacante sigue disponible, el rango salarial, horario, ubicación y los siguientes pasos del proceso.\n\nQuedo atento(a). Muchas gracias.`,
    whatsapp: `${phoneNote ? phoneNote + "\n\n" : ""}Hola, buen día. Les escribo por la vacante de ${role}${city} que vi en Facebook. Me interesa postularme y cuento con experiencia en ${matchedText}. ¿Me podrían confirmar si sigue disponible, sueldo, horario y ubicación? Gracias.`,
    profile: `Perfil profesional sugerido:\n\nProfesional con experiencia en ${matchedText}, orientado(a) a resultados, comunicación clara y seguimiento responsable. Me interesa la posición de ${role}${city} porque mi experiencia se alinea con los requisitos detectados y puedo aportar organización, aprendizaje rápido y compromiso con el proceso.`
  };
}

function createAdaptedCv(data, cvText) {
  const role = data.facts.role === "No detectado" ? "la vacante" : data.facts.role;
  const company = data.facts.company === "No aparece" ? "la empresa" : data.facts.company;
  const city = data.facts.city === "No detectada" ? "" : ` en ${data.facts.city}`;
  const relevantSkills = [...new Set([
    ...data.matched.map((item) => cleanRole(cleanFact(item))),
    ...data.profileSignals,
    ...skillKeywords.filter((keyword) => normalize(cvText).includes(keyword))
  ])]
    .filter(Boolean)
    .slice(0, 10);
  const skillText = relevantSkills.length ? relevantSkills.join(", ") : "comunicación, seguimiento, responsabilidad y aprendizaje rápido";
  const requirementsText = data.requirements.length ? data.requirements.slice(0, 5).join("; ") : "los requisitos principales de la publicación";
  const missingText = data.missing.length ? data.missing.slice(0, 3).join("; ") : "no se detectaron faltantes fuertes";
  const matchedText = data.matched.length ? data.matched.slice(0, 5).join("; ") : skillText;

  return `CV ADAPTADO A LA VACANTE

Puesto objetivo: ${role}${city}
Empresa: ${company}
Compatibilidad estimada: ${data.score}%

PERFIL PROFESIONAL
Profesional con experiencia y habilidades alineadas a ${role}, con enfoque en ${skillText}. Me caracterizo por comunicarme con claridad, dar seguimiento responsable a las tareas y adaptarme rápido a las necesidades del puesto. Busco aportar valor en ${company} con una actitud profesional, ordenada y orientada a resultados.

HABILIDADES RELEVANTES
${relevantSkills.map((skill) => `- ${titleCase(skill)}`).join("\n") || "- Comunicación clara\n- Organización\n- Atención al detalle\n- Aprendizaje rápido"}

EXPERIENCIA REDACTADA MEJOR
- He realizado actividades relacionadas con ${matchedText}, cuidando la atención, el seguimiento y la calidad del trabajo.
- Puedo apoyar en tareas clave del puesto como ${requirementsText}, manteniendo comunicación constante y buena organización.
- Mi experiencia previa me permite integrarme con rapidez, aprender procesos internos y cumplir objetivos con responsabilidad.
- Si algún requisito no aparece claramente en mi CV (${missingText}), puedo aclararlo en entrevista o reforzarlo antes de avanzar.

MENSAJE PARA RH
Hola, buen día. Me interesa postularme a la vacante de ${role}${city}. Revisé los requisitos y mi perfil coincide especialmente con ${matchedText}. Me gustaría compartir mi CV adaptado y confirmar si la vacante sigue disponible, así como los siguientes pasos del proceso. Quedo atento(a), muchas gracias.

RESPUESTAS A POSIBLES PREGUNTAS DE ENTREVISTA

1. ¿Por qué te interesa esta vacante?
Me interesa porque el puesto de ${role} se relaciona con mi experiencia en ${skillText}. Creo que puedo aportar desde el primer momento y seguir desarrollándome dentro del equipo.

2. ¿Qué experiencia tienes relacionada con el puesto?
Tengo experiencia o habilidades relacionadas con ${matchedText}. He trabajado con enfoque en responsabilidad, atención al detalle y cumplimiento de tareas.

3. ¿Qué harías si no dominas alguna herramienta o requisito?
Primero lo comunicaría con claridad, después pediría contexto o capacitación puntual y practicaría hasta alcanzar el nivel esperado. Aprendo rápido y me gusta documentar procesos para mejorar.

4. ¿Cuál es tu mayor fortaleza para esta vacante?
Mi mayor fortaleza es combinar disposición para aprender con seguimiento responsable. Me enfoco en entender lo que se necesita, cumplirlo bien y comunicar avances.

5. ¿Tienes disponibilidad para entrevista?
Sí, tengo disponibilidad para coordinar entrevista y ampliar información sobre mi experiencia, expectativas y encaje con la vacante.`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(text) {
  return normalize(text || "cv-adaptado")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "cv-adaptado";
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(array, offset, value) {
  array[offset] = value & 255;
  array[offset + 1] = (value >>> 8) & 255;
}

function writeUint32(array, offset, value) {
  array[offset] = value & 255;
  array[offset + 1] = (value >>> 8) & 255;
  array[offset + 2] = (value >>> 16) & 255;
  array[offset + 3] = (value >>> 24) & 255;
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const fileRecords = [];
  const centralRecords = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const checksum = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, dataBytes.length);
    writeUint32(local, 22, dataBytes.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);
    fileRecords.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, dataBytes.length);
    writeUint32(central, 24, dataBytes.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralRecords.push(central);
    offset += local.length;
  });

  const centralSize = centralRecords.reduce((sum, record) => sum + record.length, 0);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralSize);
  writeUint32(end, 16, offset);
  writeUint16(end, 20, 0);
  return new Blob([...fileRecords, ...centralRecords, end], { type: "application/zip" });
}

function createDocxBlob(text) {
  const paragraphs = text.split("\n").map((line) => {
    const escaped = escapeXml(line || " ");
    return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
  const entries = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    },
    { name: "word/document.xml", content: documentXml }
  ];
  return new Blob([createZip(entries)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

function renderList(selector, items, emptyText) {
  const node = document.querySelector(selector);
  node.innerHTML = "";
  const safeItems = items.length ? items : [emptyText];
  safeItems.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function saveAnalysisToHistory(data) {
  const history = getHistory();
  const item = {
    id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: data.facts.role,
    company: data.facts.company,
    date: new Date().toISOString(),
    score: data.score,
    status: "pendiente",
    notes: ""
  };
  history.unshift(item);
  saveHistory(history);
  renderHistory();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function updateHistoryItem(id, updates) {
  const history = getHistory().map((item) =>
    item.id === id ? { ...item, ...updates } : item
  );
  saveHistory(history);
}

function renderHistory() {
  const history = getHistory();
  historyList.innerHTML = "";
  historyEmpty.classList.toggle("hidden", history.length > 0);

  history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";
    card.innerHTML = `
      <div class="history-field">
        <span class="history-label">Puesto</span>
        <span class="history-value">${escapeHtml(item.role || "No detectado")}</span>
      </div>
      <div class="history-field">
        <span class="history-label">Empresa</span>
        <span class="history-value">${escapeHtml(item.company || "No aparece")}</span>
      </div>
      <div class="history-field">
        <span class="history-label">Fecha</span>
        <span class="history-value">${escapeHtml(formatDate(item.date))}</span>
      </div>
      <div class="history-field">
        <span class="history-label">Compatibilidad</span>
        <span class="history-value history-score">${escapeHtml(item.score)}%</span>
      </div>
      <label class="history-field">
        <span class="history-label">Estado</span>
        <select class="history-status" data-history-id="${item.id}">
          <option value="pendiente">Pendiente</option>
          <option value="enviado">Enviado</option>
          <option value="respondieron">Respondieron</option>
          <option value="entrevista">Entrevista</option>
          <option value="descartado">Descartado</option>
        </select>
      </label>
      <label class="history-field">
        <span class="history-label">Notas</span>
        <textarea class="history-notes" data-history-id="${item.id}" placeholder="Agrega seguimiento, contacto o pendientes."></textarea>
      </label>
    `;
    const status = card.querySelector(".history-status");
    const notes = card.querySelector(".history-notes");
    status.value = item.status || "pendiente";
    notes.value = item.notes || "";
    historyList.appendChild(card);
  });
}

function render(data) {
  results.classList.remove("hidden");
  document.querySelector("#scoreValue").textContent = `${data.score}%`;
  document.querySelector("#scoreBar").style.width = `${data.score}%`;
  document.querySelector("#recommendation").textContent = data.recommendation;
  document.querySelector("#recommendationReason").textContent = data.reason;
  const riskCard = document.querySelector("#riskCard");
  riskCard.className = `risk-card risk-${data.risk.level}`;
  document.querySelector("#riskLabel").textContent = data.risk.label;
  document.querySelector("#riskReason").textContent = data.risk.reason;

  document.querySelector("#roleFact").textContent = data.facts.role;
  document.querySelector("#companyFact").textContent = data.facts.company;
  document.querySelector("#cityFact").textContent = data.facts.city;
  document.querySelector("#salaryFact").textContent = data.facts.salary;
  document.querySelector("#experienceFact").textContent = data.facts.experience;
  document.querySelector("#scheduleFact").textContent = data.facts.schedule;
  document.querySelector("#contactFact").textContent = data.facts.contact;

  renderList("#matchedList", data.matched, "No encontré coincidencias claras. Puedes ajustar tu CV si sí tienes esa experiencia.");
  renderList("#missingList", data.missing, "No hay faltantes evidentes segun el texto pegado.");
  renderList("#alertsList", data.alerts, "No detecté alertas fuertes, pero verifica la empresa antes de compartir datos.");
  renderList("#requirementsList", data.requirements, "La publicación no trae requisitos claros.");

  const messages = createMessages(data);
  document.querySelector("#commentMsg").value = messages.comment;
  document.querySelector("#inboxMsg").value = messages.inbox;
  document.querySelector("#whatsappMsg").value = messages.whatsapp;
  document.querySelector("#profileMsg").value = messages.profile;

  currentAdaptedCvText = createAdaptedCv(data, cvInput.value);
  document.querySelector("#adaptedCvText").value = currentAdaptedCvText;
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1500);
}

function describeFile(file) {
  const sizeMb = (file.size / 1024 / 1024).toFixed(2);
  return `${file.name} (${sizeMb} MB)`;
}

function cleanExtractedText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[|\\]{2,}/g, " ")
    .replace(/[•·●]/g, "\n- ")
    .replace(/\s+n\s+/gi, "\n")
    .replace(/\s+([,.:%])/g, "$1")
    .replace(/([a-záéíóúñ])\s{2,}([a-záéíóúñ])/gi, "$1 $2")
    .replace(/([a-záéíóúñ])-\s+([a-záéíóúñ])/gi, "$1$2")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^[^\wáéíóúñÁÉÍÓÚÑ]{1,4}$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function setExtractedText(targetInput, rawText, statusNode, file, sourceName) {
  const text = cleanExtractedText(rawText);
  if (!text) {
    statusNode.textContent = `No pude detectar texto claro en ${sourceName}. Intenta con una captura más nítida.`;
    return false;
  }
  targetInput.value = text;
  statusNode.textContent = `Texto limpio extraído de ${describeFile(file)}`;
  return true;
}

function renderFilePreview(file, targetInput, previewNode) {
  const objectUrl = URL.createObjectURL(file);
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const body = isImage
    ? `<img src="${objectUrl}" alt="Vista previa de ${escapeHtml(file.name)}">`
    : isPdf
      ? `<iframe src="${objectUrl}" title="Vista previa de ${escapeHtml(file.name)}"></iframe>`
      : `<p>Archivo cargado. La app lo leerá por dentro para analizarlo.</p>`;

  targetInput.classList.add("input-hidden-by-file");
  previewNode.classList.remove("hidden");
  previewNode.innerHTML = `
    <div class="file-preview-header">
      <div class="file-preview-title">${escapeHtml(file.name)}</div>
      <button class="file-preview-action" type="button">Ver texto</button>
    </div>
    <div class="file-preview-body">${body}</div>
  `;

  previewNode.querySelector(".file-preview-action").addEventListener("click", () => {
    const isHidden = targetInput.classList.toggle("input-hidden-by-file");
    previewNode.querySelector(".file-preview-action").textContent = isHidden ? "Ver texto" : "Ocultar texto";
  });
}

function handleTextFile(file, targetInput, statusNode) {
  const reader = new FileReader();
  reader.onload = () => {
    if (setExtractedText(targetInput, reader.result, statusNode, file, "el TXT")) {
      showToast("Texto cargado desde archivo");
    }
  };
  reader.onerror = () => {
    statusNode.textContent = "No pude leer el archivo. Intenta pegar el texto manualmente.";
  };
  reader.readAsText(file, "utf-8");
}

async function handleImageFile(file, targetInput, statusNode, label) {
  if (!window.Tesseract) {
    statusNode.textContent = "No se pudo cargar el lector de imágenes. Revisa tu conexión e intenta otra vez.";
    return;
  }

  statusNode.textContent = `${label}: leyendo imagen... 0%`;
  try {
    const result = await Tesseract.recognize(file, "spa+eng", {
      logger: (event) => {
        if (event.status === "recognizing text") {
          const progress = Math.round((event.progress || 0) * 100);
          statusNode.textContent = `${label}: leyendo imagen... ${progress}%`;
        }
      }
    });
    if (setExtractedText(targetInput, result.data.text, statusNode, file, "la imagen")) {
      showToast("Texto extraído de la imagen");
    }
  } catch {
    statusNode.textContent = "No pude leer la imagen. Intenta con una captura más clara o pega el texto.";
  }
}

async function getPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  window.pdfjsLib = pdfjsLib;
  return pdfjsLib;
}

async function extractTextFromPdfPage(page) {
  const content = await page.getTextContent();
  return content.items.map((item) => item.str).join(" ").trim();
}

async function ocrPdfPage(page, pageNumber, totalPages, statusNode, label) {
  if (!window.Tesseract) return "";
  statusNode.textContent = `${label}: el PDF parece escaneado, leyendo imagen ${pageNumber} de ${totalPages}...`;
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  const result = await Tesseract.recognize(canvas, "spa+eng", {
    logger: (event) => {
      if (event.status === "recognizing text") {
        const progress = Math.round((event.progress || 0) * 100);
        statusNode.textContent = `${label}: leyendo imagen ${pageNumber} de ${totalPages}... ${progress}%`;
      }
    }
  });
  return result.data.text.trim();
}

async function handlePdfFile(file, targetInput, statusNode, label) {
  statusNode.textContent = `${label}: leyendo PDF...`;
  try {
    const pdfjsLib = await getPdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      statusNode.textContent = `${label}: leyendo PDF página ${pageNumber} de ${pdf.numPages}`;
      const page = await pdf.getPage(pageNumber);
      let pageText = await extractTextFromPdfPage(page);
      if (!pageText || pageText.length < 20) {
        pageText = await ocrPdfPage(page, pageNumber, pdf.numPages, statusNode, label);
      }
      pages.push(pageText);
    }

    if (setExtractedText(targetInput, pages.join("\n\n"), statusNode, file, "el PDF")) {
      showToast("Texto extraído del PDF");
    }
  } catch {
    statusNode.textContent = "No pude leer el PDF. Intenta subir una foto/captura clara del CV.";
  }
}

function handlePickedFile(event, targetInput, statusNode, previewNode, label) {
  const file = event.target.files?.[0];
  if (!file) return;
  renderFilePreview(file, targetInput, previewNode);
  const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (isText) {
    handleTextFile(file, targetInput, statusNode);
    return;
  }
  if (isPdf) {
    handlePdfFile(file, targetInput, statusNode, label);
    return;
  }
  if (isImage) {
    handleImageFile(file, targetInput, statusNode, label);
    return;
  }

  statusNode.textContent = `${label}: ${describeFile(file)}. Por ahora DOC/DOCX no se leen solos; usa PDF, captura o TXT.`;
  showToast("Archivo seleccionado");
}

analyzeBtn.addEventListener("click", () => {
  const cv = cvInput.value.trim();
  const job = jobInput.value.trim();
  if (!cv || !job) {
    showToast("Pega tu CV y la vacante primero");
    return;
  }
  const analysis = analyze(cv, job);
  render(analysis);
  saveAnalysisToHistory(analysis);
  results.scrollIntoView({ behavior: "smooth", block: "start" });
});

clearBtn.addEventListener("click", () => {
  cvInput.value = "";
  jobInput.value = "";
  cvFileInput.value = "";
  jobFileInput.value = "";
  cvInput.classList.remove("input-hidden-by-file");
  jobInput.classList.remove("input-hidden-by-file");
  cvFilePreview.classList.add("hidden");
  jobFilePreview.classList.add("hidden");
  cvFilePreview.innerHTML = "";
  jobFilePreview.innerHTML = "";
  cvFileStatus.textContent = "Puedes adjuntar PDF, TXT o foto. La app extrae y limpia el texto automáticamente.";
  jobFileStatus.textContent = "Puedes adjuntar captura, PDF o TXT. La app extrae y limpia el texto automáticamente.";
  results.classList.add("hidden");
  cvInput.focus();
});

cvFileInput.addEventListener("change", (event) => {
  handlePickedFile(event, cvInput, cvFileStatus, cvFilePreview, "CV seleccionado");
});

jobFileInput.addEventListener("change", (event) => {
  handlePickedFile(event, jobInput, jobFileStatus, jobFilePreview, "Publicación seleccionada");
});

document.querySelectorAll(".copy-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copyTarget}`);
    try {
      await navigator.clipboard.writeText(target.value);
      showToast("Texto copiado");
    } catch {
      target.select();
      document.execCommand("copy");
      showToast("Texto copiado");
    }
  });
});

downloadTxtBtn.addEventListener("click", () => {
  if (!currentAdaptedCvText) {
    showToast("Analiza una vacante primero");
    return;
  }
  const filename = `${safeFilename(document.querySelector("#roleFact").textContent)}.txt`;
  downloadBlob(filename, new Blob([currentAdaptedCvText], { type: "text/plain;charset=utf-8" }));
});

downloadDocxBtn.addEventListener("click", () => {
  if (!currentAdaptedCvText) {
    showToast("Analiza una vacante primero");
    return;
  }
  const filename = `${safeFilename(document.querySelector("#roleFact").textContent)}.docx`;
  downloadBlob(filename, createDocxBlob(currentAdaptedCvText));
});

historyList.addEventListener("change", (event) => {
  if (!event.target.matches(".history-status")) return;
  updateHistoryItem(event.target.dataset.historyId, { status: event.target.value });
  showToast("Estado guardado");
});

historyList.addEventListener("input", (event) => {
  if (!event.target.matches(".history-notes")) return;
  updateHistoryItem(event.target.dataset.historyId, { notes: event.target.value });
});

renderHistory();
