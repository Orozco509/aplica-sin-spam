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
const roleSelect = document.querySelector("#roleSelect");
const adminPinWrap = document.querySelector("#adminPinWrap");
const adminPin = document.querySelector("#adminPin");
const unlockAdminBtn = document.querySelector("#unlockAdminBtn");
const externalOcrConsent = document.querySelector("#externalOcrConsent");
const accessStatus = document.querySelector("#accessStatus");
const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
const HISTORY_KEY = "facebookCvAssistantHistory";
const ROLE_KEY = "facebookCvAssistantRole";
const ADMIN_PIN_KEY = "facebookCvAssistantAdminPin";
const OCR_SPACE_API_KEY = "helloworld";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 30000;
const MIN_ANALYSIS_LENGTH = 20;
let currentAdaptedCvText = "";
let currentRole = localStorage.getItem(ROLE_KEY) === "admin" ? "admin" : "user";

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

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s$@.+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeInputText(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function validateAnalysisInputs(cv, job) {
  if (cv.length < MIN_ANALYSIS_LENGTH || job.length < MIN_ANALYSIS_LENGTH) {
    return "Necesito texto suficiente del CV y de la vacante para analizar.";
  }
  if (cv.length >= MAX_TEXT_LENGTH || job.length >= MAX_TEXT_LENGTH) {
    return "El texto es demasiado largo. Recorté el contenido; revisa que siga lo importante.";
  }
  return "";
}

function validateFile(file, needsOcr) {
  const allowed = file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type.startsWith("text/") ||
    file.name.toLowerCase().endsWith(".txt");
  if (!allowed) return "Tipo de archivo no permitido. Usa PDF, TXT o imagen.";
  if (file.size > MAX_FILE_SIZE) return "El archivo pesa demasiado. Máximo 8 MB.";
  if (needsOcr && !externalOcrConsent.checked) {
    return "Marca la autorización para procesar fotos/PDFs con OCR externo.";
  }
  return "";
}

function applyRole() {
  const selectedRole = roleSelect.value;
  const wantsAdmin = selectedRole === "admin";
  adminPinWrap.classList.toggle("hidden", !wantsAdmin || currentRole === "admin");
  unlockAdminBtn.classList.toggle("hidden", !wantsAdmin || currentRole === "admin");
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", currentRole !== "admin");
  });
  accessStatus.textContent = currentRole === "admin"
    ? "Rol actual: administrador local. Puedes borrar historial."
    : "Rol actual: usuario.";
}

// Conectores que quedan en minúscula salvo al inicio de la frase.
const TITLE_CONNECTORS = new Set([
  "a", "de", "del", "la", "las", "los", "el", "y", "e", "o", "u",
  "en", "con", "para", "por", "al", "da", "the", "of"
]);

function titleCase(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) =>
      index > 0 && TITLE_CONNECTORS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function firstMatch(text, patterns, fallback = "") {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return fallback;
}

// ============================================================
// CAPA DE COMPRENSIÓN LOCAL (Fase 1)
// Convierte texto crudo / OCR en un MODELO TIPADO y validado.
// Regla de oro: la generación (mensajes, perfil, CV, compatibilidad)
// SOLO lee de este modelo, nunca del texto crudo.
// ============================================================

// Vocabulario de habilidades. Cada habilidad tiene una clave estable,
// una etiqueta legible y los patrones (sin acentos) con que se reconoce.
const SKILL_LEXICON = [
  { clave: "mantenimiento", etiqueta: "mantenimiento", patrones: ["mantenimiento", "mantto"] },
  { clave: "mecanica", etiqueta: "mecánica", patrones: ["mecanica", "mecanico"] },
  { clave: "hidraulica", etiqueta: "hidráulica", patrones: ["hidraulica", "hidraulico"] },
  { clave: "electricidad", etiqueta: "electricidad", patrones: ["electricidad", "electrica", "electrico"] },
  { clave: "neumatica", etiqueta: "neumática", patrones: ["neumatica", "neumatico"] },
  { clave: "electromecanica", etiqueta: "electromecánica", patrones: ["electromecanica", "electromecanico"] },
  { clave: "soldadura", etiqueta: "soldadura", patrones: ["soldadura", "soldar", "soldador"] },
  { clave: "plc", etiqueta: "PLC", patrones: ["plc"] },
  { clave: "excel", etiqueta: "Excel", patrones: ["excel"] },
  { clave: "ventas", etiqueta: "ventas", patrones: ["ventas", "vendedor"] },
  { clave: "atencion_clientes", etiqueta: "atención a clientes", patrones: ["atencion a clientes", "atencion al cliente", "servicio al cliente"] },
  { clave: "caja", etiqueta: "manejo de caja", patrones: ["manejo de caja", "cajero"] },
  { clave: "facturacion", etiqueta: "facturación", patrones: ["facturacion"] },
  { clave: "administracion", etiqueta: "administración", patrones: ["administracion", "administrativo"] },
  { clave: "inventarios", etiqueta: "inventarios", patrones: ["inventarios", "inventario"] },
  { clave: "almacen", etiqueta: "almacén", patrones: ["almacen", "almacenista"] },
  { clave: "logistica", etiqueta: "logística", patrones: ["logistica"] },
  { clave: "contabilidad", etiqueta: "contabilidad", patrones: ["contabilidad", "contable", "contador"] },
  { clave: "nomina", etiqueta: "nómina", patrones: ["nomina"] },
  { clave: "reclutamiento", etiqueta: "reclutamiento", patrones: ["reclutamiento", "reclutador"] },
  { clave: "marketing", etiqueta: "marketing", patrones: ["marketing", "mercadotecnia"] },
  { clave: "redes_sociales", etiqueta: "redes sociales", patrones: ["redes sociales", "community manager"] },
  { clave: "diseno", etiqueta: "diseño", patrones: ["photoshop", "illustrator", "canva", "diseno grafico"] },
  { clave: "programacion", etiqueta: "programación", patrones: ["javascript", "python", "programacion", "programador"] },
  { clave: "office", etiqueta: "Office", patrones: ["office", "word", "powerpoint"] },
  { clave: "ingles", etiqueta: "inglés", patrones: ["ingles", "bilingue"] },
  { clave: "crm", etiqueta: "CRM", patrones: ["crm", "salesforce"] },
  { clave: "sap", etiqueta: "SAP", patrones: ["sap"] },
  { clave: "conduccion", etiqueta: "conducción / manejo de unidad", patrones: ["chofer", "licencia de conducir", "manejo de unidad", "repartidor"] },
  { clave: "cocina", etiqueta: "cocina", patrones: ["cocina", "cocinero", "cocinera", "preparacion de alimentos"] },
  { clave: "limpieza", etiqueta: "limpieza", patrones: ["limpieza", "intendencia"] },
  { clave: "vigilancia", etiqueta: "vigilancia / seguridad", patrones: ["vigilancia", "guardia de seguridad", "seguridad privada", "vigilante"] },
  { clave: "montacargas", etiqueta: "montacargas", patrones: ["montacargas", "montacarguista"] },
  { clave: "enfermeria", etiqueta: "enfermería", patrones: ["enfermeria", "enfermero", "enfermera"] },
  { clave: "carpinteria", etiqueta: "carpintería", patrones: ["carpinteria", "carpintero"] },
  { clave: "pintura", etiqueta: "pintura", patrones: ["pintura", "pintor"] },
  { clave: "albanileria", etiqueta: "albañilería", patrones: ["albanileria", "albanil"] },
  { clave: "costura", etiqueta: "costura", patrones: ["costura", "costurera", "confeccion"] },
  { clave: "cobranza", etiqueta: "cobranza", patrones: ["cobranza", "recuperacion de cartera"] },
  { clave: "call_center", etiqueta: "call center / telefónico", patrones: ["call center", "telemarketing", "telefonista", "centro de atencion telefonica"] },
  { clave: "recursos_humanos", etiqueta: "recursos humanos", patrones: ["recursos humanos", "capital humano"] },
  { clave: "jardineria", etiqueta: "jardinería", patrones: ["jardineria", "jardinero"] }
];

// Vocabulario de prestaciones / beneficios (nunca deben confundirse con la empresa).
const BENEFIT_LEXICON = [
  { etiqueta: "Vales de despensa", patrones: ["vales de despensa", "vales despensa", "despensa", "vales"] },
  { etiqueta: "Fondo de ahorro", patrones: ["fondo de ahorro"] },
  { etiqueta: "Caja de ahorro", patrones: ["caja de ahorro"] },
  { etiqueta: "Prestaciones de ley", patrones: ["prestaciones de ley", "prestaciones superiores", "prestaciones"] },
  { etiqueta: "Utilidades", patrones: ["utilidades", "reparto de utilidades", "ptu"] },
  { etiqueta: "Aguinaldo", patrones: ["aguinaldo"] },
  { etiqueta: "Prima vacacional", patrones: ["prima vacacional"] },
  { etiqueta: "IMSS / Seguro social", patrones: ["imss", "seguro social", "seguridad social"] },
  { etiqueta: "Seguro de gastos médicos", patrones: ["gastos medicos", "sgmm"] },
  { etiqueta: "Bonos", patrones: ["bono", "bonos"] },
  { etiqueta: "Comisiones", patrones: ["comisiones", "comision"] },
  { etiqueta: "Capacitación", patrones: ["capacitacion"] },
  { etiqueta: "Transporte / ruta", patrones: ["ruta de personal", "transporte de personal"] },
  { etiqueta: "Comedor / apoyo de comida", patrones: ["comedor", "apoyo de comida", "vales de comida"] }
];

// Vocabulario de puestos: detecta el puesto probable de forma limpia
// (las específicas primero para no confundir "auxiliar administrativo" con "auxiliar").
const ROLE_LEXICON = [
  { etiqueta: "Auxiliar administrativo", patrones: ["auxiliar administrativo", "aux administrativo", "auxiliar contable"] },
  { etiqueta: "Auxiliar de almacén", patrones: ["auxiliar de almacen"] },
  { etiqueta: "Cajero/a", patrones: ["cajera", "cajero"] },
  { etiqueta: "Chofer repartidor", patrones: ["chofer repartidor", "repartidor", "chofer"] },
  { etiqueta: "Asesor de ventas", patrones: ["asesor de ventas", "ejecutivo de ventas", "vendedor", "vendedora"] },
  { etiqueta: "Almacenista", patrones: ["almacenista"] },
  { etiqueta: "Mecánico", patrones: ["mecanico"] },
  { etiqueta: "Soldador", patrones: ["soldador"] },
  { etiqueta: "Electricista", patrones: ["electricista"] },
  { etiqueta: "Recepcionista", patrones: ["recepcionista"] },
  { etiqueta: "Mesero/a", patrones: ["mesero", "mesera"] },
  { etiqueta: "Cocinero/a", patrones: ["cocinero", "cocinera"] },
  { etiqueta: "Operador de producción", patrones: ["operador de produccion", "operador de maquina", "operario"] },
  { etiqueta: "Supervisor", patrones: ["supervisor"] },
  { etiqueta: "Gerente", patrones: ["gerente"] },
  { etiqueta: "Ingeniero", patrones: ["ingeniero"] },
  { etiqueta: "Guardia de seguridad", patrones: ["guardia de seguridad", "vigilante", "elemento de seguridad"] },
  { etiqueta: "Personal de limpieza", patrones: ["personal de limpieza", "intendencia", "afanador"] },
  { etiqueta: "Enfermero/a", patrones: ["enfermero", "enfermera"] },
  { etiqueta: "Agente telefónico", patrones: ["agente telefonico", "call center", "telemarketing", "telefonista"] },
  { etiqueta: "Montacarguista", patrones: ["montacarguista", "operador de montacargas"] },
  { etiqueta: "Carpintero", patrones: ["carpintero"] },
  { etiqueta: "Pintor", patrones: ["pintor"] },
  { etiqueta: "Albañil", patrones: ["albanil"] },
  { etiqueta: "Cobrador", patrones: ["cobrador", "gestor de cobranza"] },
  { etiqueta: "Costurera", patrones: ["costurera"] },
  { etiqueta: "Ayudante general", patrones: ["ayudante general", "ayudante", "peon"] },
  { etiqueta: "Técnico", patrones: ["tecnico"] }
];

// Palabras de giro comercial: si aparecen, puede haber un nombre de empresa
// aunque no traiga "S.A." (se reporta como "posible", a confirmar).
const COMPANY_HINTS = [
  "tienda", "abarrotes", "restaurante", "taqueria", "cafeteria", "boutique",
  "taller", "farmacia", "ferreteria", "estetica", "hotel", "distribuidora",
  "comercializadora", "purificadora", "constructora", "inmobiliaria",
  "refaccionaria", "papeleria", "panaderia", "tortilleria", "carniceria",
  "autolavado", "gimnasio", "clinica", "veterinaria", "muebleria",
  "supermercado", "minisuper", "fabrica", "industrias", "transportes"
];

// LADAs principales de México para inferir ciudad a partir del teléfono.
const LADA_CIUDAD = {
  "55": "Ciudad de México", "33": "Guadalajara", "81": "Monterrey",
  "442": "Querétaro", "222": "Puebla", "662": "Hermosillo", "664": "Tijuana",
  "656": "Ciudad Juárez", "614": "Chihuahua", "477": "León",
  "444": "San Luis Potosí", "999": "Mérida", "998": "Cancún",
  "229": "Veracruz", "228": "Xalapa", "833": "Tampico", "867": "Nuevo Laredo",
  "844": "Saltillo", "618": "Durango", "443": "Morelia", "311": "Tepic",
  "312": "Colima", "612": "La Paz", "646": "Ensenada", "686": "Mexicali",
  "771": "Pachuca", "461": "Celaya", "473": "Guanajuato", "722": "Toluca"
};

const REQUIREMENT_PRIORITY = {
  escolaridad: 1, experiencia: 2, habilidad: 2, idioma: 3,
  licencia: 4, disponibilidad: 5, edad: 6, otro: 7
};

const PHONE_MATCH = /(?:\+?52[\s.-]?)?(?:\d[\s.-]?){10,12}/g;

// Une elementos en lenguaje natural: ["a","b","c"] -> "a, b y c".
function joinHuman(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

// Quita emojis y símbolos pictográficos.
function stripEmojis(text) {
  return String(text || "").replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
    " "
  );
}

// Limpia una línea: quita emojis, normaliza MAYÚSCULAS sostenidas, capitaliza.
function tidyLine(line) {
  let s = stripEmojis(String(line || "")).replace(/\s+/g, " ").trim().replace(/[.;,:!¡¿?]+$/, "").trim();
  if (!s) return "";
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letters.length > 3 && letters === letters.toUpperCase()) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Separa una línea en cláusulas: quita la etiqueta "Requisitos:" y parte por
// comas (no entre dígitos) y por " y " / " e ". Convierte listas en ítems.
function splitClauses(line) {
  let s = stripEmojis(line);
  const label = s.match(/(?:requisitos?|requerimientos?|perfil|ofrecemos)\s*:/i);
  if (label) s = s.slice(s.indexOf(label[0]) + label[0].length);
  return s
    .split(/\s*,(?!\d)\s*|\s+[yYeE]\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

// Reconoce habilidades dentro de un texto y las devuelve tipadas (sin duplicar).
function detectSkillsInText(rawText) {
  const norm = normalize(rawText);
  const found = [];
  const seen = new Set();
  SKILL_LEXICON.forEach((skill) => {
    if (!seen.has(skill.clave) && skill.patrones.some((p) => norm.includes(p))) {
      seen.add(skill.clave);
      found.push({ clave: skill.clave, etiqueta: skill.etiqueta });
    }
  });
  return found;
}

// Reconoce prestaciones dentro de un texto y devuelve etiquetas validadas.
function detectBenefits(rawText) {
  const norm = normalize(rawText);
  const found = [];
  const seen = new Set();
  BENEFIT_LEXICON.forEach((benefit) => {
    if (!seen.has(benefit.etiqueta) && benefit.patrones.some((p) => norm.includes(p))) {
      seen.add(benefit.etiqueta);
      found.push(benefit.etiqueta);
    }
  });
  return found;
}

// Extrae teléfonos como objetos { display, digits }.
function extractPhones(text) {
  const found = [];
  const seen = new Set();
  (text.match(PHONE_MATCH) || []).forEach((match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13 && !seen.has(digits)) {
      seen.add(digits);
      const display = match.trim().replace(/\s+/g, " ").replace(/[\s.\-]+$/, "");
      found.push({ display, digits });
    }
  });
  return found;
}

// Divide el texto en segmentos (una idea por segmento) sin usar lookbehind.
function segmentLines(rawText) {
  return String(rawText || "")
    .replace(/([.;])\s+/g, "$1\n")
    .split(/\n|•|·|●|•|·/)
    .map((s) => s.replace(/^[\s\-*•·.]+/, "").trim())
    .filter((s) => s.length > 1);
}

// ¿La línea es esencialmente una prestación (y no un requisito ni habilidad)?
function isBenefitLine(line) {
  return detectBenefits(line).length > 0 &&
    detectSkillsInText(line).length === 0 &&
    !/experiencia|carrera|tecnic|ingenieri|licencia|edad|disponibilidad|rolar|turno/.test(normalize(line));
}

// ¿La línea es esencialmente de contacto (teléfono, correo, "informes")?
function isContactLine(line) {
  if (extractPhones(line).length || extractEmails(line).length) return true;
  const norm = normalize(line);
  return /^(contacto|informes|whatsapp|wsp|enviar cv|mandar cv|interesados)\b/.test(norm) &&
    detectSkillsInText(line).length === 0;
}

// Clasifica una línea de requisito en una categoría semántica.
function classifyRequirementLine(line) {
  const norm = normalize(line);
  const skills = detectSkillsInText(line);
  if (/\bedad\b/.test(norm) || /\b\d{2}\s*(?:a|-|al)\s*\d{2}\b\s*(?:anos|ano)?/.test(norm)) {
    return { categoria: "edad", skills: [] };
  }
  // Escolaridad: exige contexto real de estudios (evita confundir "técnicos" de un eslogan).
  if (/carrera|ingenieri|licenciatura|bachillerato|preparatoria|secundaria|escolaridad|t[ií]tulo|estudi|carrera tecnica|tecnica\b|tecnico en/.test(norm)) {
    return { categoria: "escolaridad", skills };
  }
  if (/disponibilidad|rolar|rotativ|\bturno|jornada|horario|tiempo completo|medio tiempo/.test(norm)) {
    return { categoria: "disponibilidad", skills };
  }
  if (/licencia/.test(norm)) return { categoria: "licencia", skills };
  if (/ingles|bilingue|idioma/.test(norm) && skills.length) return { categoria: "idioma", skills };
  if (/experiencia/.test(norm)) return { categoria: "experiencia", skills };
  if (skills.length) return { categoria: "habilidad", skills };
  return { categoria: "otro", skills: [] };
}

// Construye la lista tipada de requisitos y las habilidades requeridas.
// Expande listas: "experiencia en mecánica, hidráulica y eléctrica" -> 3 requisitos.
function buildRequirements(segments) {
  const requisitos = [];
  const habilidadesRequeridas = [];
  const seenSkill = new Set();
  const seenText = new Set();

  const pushSkill = (skill, texto) => {
    if (seenSkill.has(skill.clave)) return;
    seenSkill.add(skill.clave);
    habilidadesRequeridas.push(skill);
    requisitos.push({ texto, categoria: "habilidad", clave: skill.clave, esHabilidad: true });
  };

  segments.forEach((segment) => {
    if (isBenefitLine(segment) || isContactLine(segment)) return;

    splitClauses(segment).forEach((clause) => {
      if (isBenefitLine(clause) || isContactLine(clause)) return;
      const { categoria, skills } = classifyRequirementLine(clause);

      if ((categoria === "experiencia" || categoria === "habilidad" || categoria === "idioma") && skills.length) {
        skills.forEach((skill, index) => {
          const texto = index === 0 && categoria === "experiencia"
            ? `Experiencia en ${skill.etiqueta}`
            : `Conocimientos de ${skill.etiqueta}`;
          pushSkill(skill, texto);
        });
        return;
      }

      if (categoria === "licencia") {
        const key = "licencia de conducir";
        if (!seenText.has(key)) {
          seenText.add(key);
          requisitos.push({ texto: "Licencia de conducir vigente", categoria: "licencia", esHabilidad: false });
        }
        return;
      }

      if (categoria === "otro" && skills.length === 0 &&
        !/requisito|indispensable|deseable|imprescindible|necesario|debe |manejo de|secundaria|preparatoria/.test(normalize(clause))) {
        return; // descarta relleno, eslóganes o líneas de título
      }

      const texto = tidyLine(clause);
      const key = normalize(texto);
      if (!texto || texto.length < 3 || seenText.has(key)) return;
      seenText.add(key);
      requisitos.push({ texto, categoria, esHabilidad: false });
    });
  });

  requisitos.sort((a, b) =>
    (REQUIREMENT_PRIORITY[a.categoria] || 9) - (REQUIREMENT_PRIORITY[b.categoria] || 9));
  return { requisitos, habilidadesRequeridas };
}

// Valida que un texto realmente parezca nombre de empresa (no prestación ni requisito).
function isValidCompany(text) {
  const norm = normalize(text);
  if (norm.length < 3 || norm.length > 50) return false;
  if (detectBenefits(text).length || detectSkillsInText(text).length) return false;
  return !/experiencia|requisito|turno|horario|disponibilidad|sueldo|salario|edad|prestacion|ahorro|despensa|utilidades|profesional|tecnic|vacante|solicita|contrata/.test(norm);
}

// Arregla mayúsculas de formas legales tras el titleCase.
function fixLegalForms(name) {
  return name
    .replace(/s\.?\s*a\.?\s*de\s*c\.?\s*v\.?/i, "S.A. de C.V.")
    .replace(/\bsapi\b/i, "SAPI")
    .replace(/\bs\s+de\s+rl(?:\s+de\s+cv)?\b/i, "S. de R.L.");
}

// Segundo nivel: busca un nombre comercial junto a un giro (tienda, taller, etc.).
function detectPossibleCompany(rawJob) {
  const stop = /^(sueldo|salario|pago|horario|requisitos?|prestaciones|vales|despensa|whatsapp|interesados?|solicitamos|solicita|solicito|buscamos|busca|contratamos|contrata|necesita|necesitamos|requiere|ofrece|ofrecemos|zona|experiencia|edad|turno|disponibilidad|para)$/;
  const tokens = stripEmojis(rawJob).replace(/[!¡¿?,.]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    if (!COMPANY_HINTS.includes(normalize(tokens[i]))) continue;
    const parts = [tokens[i]];
    for (let j = i + 1; j < tokens.length && parts.length < 5; j += 1) {
      const nt = normalize(tokens[j]);
      if (!/^[a-záéíóúüñ&]+$/.test(nt) || stop.test(nt) || /^\d/.test(tokens[j])) break;
      parts.push(tokens[j]);
    }
    if (parts.join("").length >= 6 && parts.length >= 2) {
      return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
  }
  return "";
}

// Detecta empresa. Devuelve { nombre, certeza }: "alta" (marcador legal/empresa),
// "posible" (nombre comercial sin marcador), o "ninguna".
function detectCompany(rawJob) {
  const markers = [
    /\b([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,45}\s+S\.?\s*A\.?\s*(?:de\s+C\.?\s*V\.?|P\.?\s*I\.?)?)/,
    /(?:empresa|compa[nñ][ií]a|grupo|corporativo|consultora|agencia|despacho)\s*[:.\-]?\s*([A-ZÁÉÍÓÚÜÑ][\wÁÉÍÓÚÜÑáéíóúüñ.& -]{2,45}?)(?=[.,\n]|$)/i
  ];
  for (const re of markers) {
    const m = rawJob.match(re);
    if (m) {
      const candidate = (m[1] || m[0]).trim();
      if (isValidCompany(candidate)) {
        return { nombre: fixLegalForms(titleCase(cleanFact(candidate))), certeza: "alta" };
      }
    }
  }
  const posible = detectPossibleCompany(rawJob);
  if (posible) return { nombre: posible, certeza: "posible" };
  return { nombre: "No detectada con certeza", certeza: "ninguna" };
}

// Busca un puesto canónico del léxico dentro de un texto.
function matchRoleLexicon(text) {
  const norm = normalize(text);
  for (const role of ROLE_LEXICON) {
    if (role.patrones.some((p) => norm.includes(p))) return role.etiqueta;
  }
  return "";
}

// Detecta el puesto probable: 1) léxico tras una frase explícita, 2) léxico en
// todo el texto, 3) inferencia electromecánica. Nunca devuelve texto crudo/emoji.
function detectRole(rawJob, requiredSkills) {
  const claves = new Set(requiredSkills.map((s) => s.clave));
  const electro = ["mecanica", "hidraulica", "electricidad", "neumatica", "electromecanica", "mantenimiento"]
    .some((c) => claves.has(c));
  const mentionsTecnico = /\bt[eé]cnico/i.test(rawJob);

  const explicit = firstMatch(rawJob, [
    /(?:vacante de|puesto de|plaza de|se solicita|solicitamos|solicito|buscamos|busca|contratamos|contrata|necesitamos)\s+([^.,\n|]{3,60})/i
  ]);
  if (explicit) {
    const fromLex = matchRoleLexicon(explicit);
    if (fromLex) {
      if (electro && mentionsTecnico) return "Técnico electromecánico / Técnico de mantenimiento";
      return fromLex;
    }
    const cleaned = titleCase(tidyLine(cleanRole(cleanFact(stripEmojis(explicit).split(/\$|\d/)[0]))));
    if (cleaned && cleaned.length >= 3 && !detectBenefits(cleaned).length) return cleaned;
  }

  const fromText = matchRoleLexicon(rawJob);
  if (fromText) {
    if (electro && mentionsTecnico) return "Técnico electromecánico / Técnico de mantenimiento";
    return fromText;
  }
  if (electro && mentionsTecnico) return "Técnico electromecánico / Técnico de mantenimiento";
  return "No detectado con claridad";
}

function detectCity(rawJob) {
  const m = firstMatch(rawJob, [
    /(?:ciudad|ubicacion|ubicaci[oó]n|zona|sucursal)\s*[:.\-]?\s*(cdmx|ciudad de m[eé]xico|monterrey|guadalajara|quer[eé]taro|puebla|toluca|tijuana|m[eé]rida|le[oó]n|saltillo|canc[uú]n|zapopan|apodaca|escobedo|santa catarina|garc[ií]a)/i,
    /\b(cdmx|monterrey|guadalajara|quer[eé]taro|puebla|toluca|tijuana|m[eé]rida|saltillo|canc[uú]n|zapopan|apodaca|escobedo)\b/i
  ]);
  return m ? titleCase(tidyLine(cleanFact(m))) : "No detectada";
}

// Infiere la ciudad a partir de la LADA del teléfono (se marca como aproximada).
function detectCityFromPhone(phones) {
  for (const phone of phones) {
    let digits = phone.digits;
    if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length !== 10) continue;
    const two = digits.slice(0, 2);
    const three = digits.slice(0, 3);
    if (LADA_CIUDAD[two]) return LADA_CIUDAD[two];
    if (LADA_CIUDAD[three]) return LADA_CIUDAD[three];
  }
  return "";
}

function detectSalary(rawJob) {
  const text = stripEmojis(rawJob);
  // Rango con $ obligatorio: "$10,000 a $12,000 mensuales" (evita confundir teléfonos).
  const range = text.match(/\$\s?\d{1,3}(?:[,.\s]?\d{3})+\s*(?:a|-|–|hasta)\s*\$?\s?\d{1,3}(?:[,.\s]?\d{3})+\s*(?:mensual(?:es)?|semanal(?:es)?|quincenal(?:es)?|diari[oa]s?|al mes|por mes|netos|brutos)?/i);
  if (range) return tidyLine(range[0].replace(/\s+/g, " "));
  const m = firstMatch(text, [
    /(?:sueldo|salario|pago|ofrecemos|ingreso)\s*(?:de|desde)?\s*[:.\-]?\s*(\$?\s?\d[\d,.\s]*(?:a|-|hasta)?\s?\$?\s?\d*[\d,.\s]*(?:\s?(?:mensual(?:es)?|semanal(?:es)?|quincenal(?:es)?|diari[oa]s?|netos|brutos))?)/i,
    /\$\s?\d[\d.,]{2,}(?:\s?(?:mensual(?:es)?|semanal(?:es)?|diari[oa]s?))?/i
  ]);
  return m ? tidyLine(cleanFact(m)) : "No aparece";
}

function formatExperience(num, unit) {
  const n = Number(num);
  const u = /mes/.test(unit) ? (n === 1 ? "mes" : "meses") : (n === 1 ? "año" : "años");
  return `${n} ${u} de experiencia`;
}

function detectExperienceYears(rawJob) {
  const norm = normalize(rawJob);
  if (/sin experiencia|no se requiere experiencia|no necesitas experiencia|no es necesaria experiencia|no indispensable experiencia/.test(norm)) {
    return "No requiere experiencia previa";
  }
  // "2 años de experiencia"
  let m = norm.match(/(\d+)\s*(anos?|meses|mes)\s+de\s+experiencia/);
  if (m) return formatExperience(m[1], m[2]);
  // "experiencia (laboral) (mínima) (de) 1 año/6 meses"
  m = norm.match(/experiencia\s+(?:laboral\s+)?(?:m[ií]nim[ao]\s+)?(?:de\s+)?(\d+)\s*(anos?|meses|mes)/);
  if (m) return formatExperience(m[1], m[2]);
  // "mínimo 1 año ... experiencia"
  m = norm.match(/(?:m[ií]nimo|al menos)\s+(\d+)\s*(anos?|meses|mes)/);
  if (m && /experiencia/.test(norm)) return formatExperience(m[1], m[2]);
  return "No especificada";
}

function detectSchedule(rawJob) {
  const norm = normalize(rawJob);
  if (/rolar turnos?|turnos? rotativos?|rotar turnos?/.test(norm)) return "Turnos rotativos";
  if (/disponibilidad de horario|horarios? flexibles?|horario flexible/.test(norm)) return "Horario flexible";
  const dias = firstMatch(rawJob, [
    /(lunes\s+a\s+(?:viernes|s[aá]bado|sabado|domingo)[^.,\n|]{0,35})/i
  ]);
  if (dias) return titleCase(tidyLine(dias));
  const tipo = firstMatch(rawJob, [/(tiempo completo|medio tiempo|home office|h[ií]brido|presencial)/i]);
  if (tipo) return titleCase(tidyLine(tipo));
  const generic = firstMatch(rawJob, [/(?:horario|turno|jornada)\s*[:.\-]?\s*([^.,\n|]{3,50})/i]);
  if (generic && !/\$|sueldo|salario|\bpago\b|comisi|despensa|ahorro/.test(normalize(generic))) {
    return titleCase(tidyLine(cleanFact(generic)));
  }
  return "No especificado";
}

// Construye el MODELO TIPADO de la vacante.
function buildVacancyModel(rawJob) {
  const segments = segmentLines(rawJob);
  const { requisitos, habilidadesRequeridas } = buildRequirements(segments);
  const beneficios = detectBenefits(rawJob);
  const telefonos = extractPhones(rawJob);
  const correos = extractEmails(rawJob);
  const display = [...telefonos.map((p) => p.display), ...correos].join(" / ") || "No aparece";
  const empresaInfo = detectCompany(rawJob);

  let ciudad = detectCity(rawJob);
  let ciudadAprox = false;
  if (ciudad === "No detectada") {
    const porLada = detectCityFromPhone(telefonos);
    if (porLada) { ciudad = porLada; ciudadAprox = true; }
  }

  return {
    raw: rawJob,
    puesto: detectRole(rawJob, habilidadesRequeridas),
    empresa: empresaInfo.nombre,
    empresaCerteza: empresaInfo.certeza,
    ciudad,
    ciudadAprox,
    sueldo: detectSalary(rawJob),
    experiencia: detectExperienceYears(rawJob),
    horario: detectSchedule(rawJob),
    contacto: { telefonos, correos, display },
    requisitos,
    habilidadesRequeridas,
    beneficios
  };
}

// Construye el MODELO TIPADO del candidato (solo habilidades validadas).
function buildCandidateModel(rawCv) {
  const norm = normalize(rawCv);
  return {
    raw: rawCv,
    habilidades: detectSkillsInText(rawCv),
    tieneEstudios: /carrera|tecnic|ingenier|licenciad|licenciatura|bachillerato|preparatoria|secundaria|t[ií]tulo|estudi|egresad|pasante/.test(norm),
    tieneLicencia: /licencia\s+(?:de\s+)?(?:conducir|manejo|chofer)|licencia\s+(?:tipo|vigente)|licencia\s+de\s+conducir/.test(norm),
    tieneDisponibilidad: /disponibilidad|disponible|horario\s+flexible|rolar|turnos?|tiempo\s+completo/.test(norm)
  };
}

// Compatibilidad honesta: compara solo habilidades reales contra requisitos de habilidad.
function computeCompatibility(vacancy, candidate) {
  const candidateClaves = new Set(candidate.habilidades.map((s) => s.clave));
  const matched = [];
  const missing = [];

  let credReqs = 0;
  let credHits = 0;
  vacancy.requisitos.forEach((req) => {
    if (req.categoria === "edad" || req.categoria === "disponibilidad") return; // informativos
    if (req.esHabilidad && req.clave) {
      (candidateClaves.has(req.clave) ? matched : missing).push(req.texto);
      return;
    }
    if (req.categoria === "escolaridad") {
      credReqs += 1;
      if (candidate.tieneEstudios) { credHits += 1; matched.push(req.texto); } else missing.push(req.texto);
      return;
    }
    if (req.categoria === "licencia") {
      credReqs += 1;
      if (candidate.tieneLicencia) { credHits += 1; matched.push(req.texto); } else missing.push(req.texto);
    }
    // otro queda informativo
  });

  const requiredSkills = vacancy.habilidadesRequeridas;
  const matchedSkills = requiredSkills.filter((s) => candidateClaves.has(s.clave));
  const skillScore = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 0.3;
  const credScore = credReqs ? credHits / credReqs : 0.5; // neutral si la vacante no pide credenciales
  const infoScore = [vacancy.puesto, vacancy.ciudad, vacancy.sueldo, vacancy.horario, vacancy.contacto.display]
    .filter((v) => v && !/^No /.test(v)).length / 5;

  const score = Math.max(0, Math.min(100, Math.round(skillScore * 70 + credScore * 15 + infoScore * 15)));
  return { matched, missing, matchedSkills, skillScore, score };
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

// Solo cuenta cantidades que sean dinero: con "$" delante o con palabra de
// pago detrás. Evita confundir teléfonos o números sueltos con sueldos.
function extractMoneyAmounts(text) {
  const amounts = [];
  const re = /\$\s?(\d{1,3}(?:[,\s.]\d{3})+|\d{3,6})|(\d{1,3}(?:[,\s.]\d{3})+|\d{4,6})\s*(?:pesos|mxn|mensual(?:es)?|semanal(?:es)?|quincenal(?:es)?|diari[oa]s?|al mes|al dia|por dia|por semana)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] || match[2] || "";
    const amount = Number(raw.replace(/[,\s.]/g, ""));
    if (Number.isFinite(amount)) amounts.push(amount);
  }
  return amounts;
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

function analyze(cv, job) {
  // 1) COMPRENDER: construir modelos tipados antes de generar nada.
  const vacancy = buildVacancyModel(job);
  const candidate = buildCandidateModel(cv);
  const compat = computeCompatibility(vacancy, candidate);

  // 2) Adaptar al formato de "datos detectados" que muestra la interfaz.
  const facts = {
    role: vacancy.puesto,
    company: vacancy.empresaCerteza === "posible" ? `${vacancy.empresa} (posible, confirmar)` : vacancy.empresa,
    city: vacancy.ciudadAprox ? `${vacancy.ciudad} (aprox. por LADA)` : vacancy.ciudad,
    salary: vacancy.sueldo,
    experience: vacancy.experiencia,
    schedule: vacancy.horario,
    contact: vacancy.contacto.display,
    phone: vacancy.contacto.telefonos[0]?.digits || ""
  };

  const riskResult = evaluateVacancyRisk(job, facts);
  const alerts = riskResult.alerts.map((item) => item.text);

  let score = compat.score;
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
    requirements: vacancy.requisitos.map((r) => r.texto),
    beneficios: vacancy.beneficios,
    matched: compat.matched,
    missing: compat.missing,
    alerts,
    risk: riskResult.risk,
    score,
    recommendation,
    reason,
    model: vacancy,
    candidate,
    match: compat
  };
}

// Frase de habilidades para los mensajes: SOLO etiquetas validadas del modelo.
// Si el CV coincide, usa las habilidades del candidato; si no, las que pide la vacante.
function buildSkillPhrase(data, limit) {
  const matchedLabels = data.match.matchedSkills.map((s) => s.etiqueta);
  const requiredLabels = data.model.habilidadesRequeridas.map((s) => s.etiqueta);
  const labels = (matchedLabels.length ? matchedLabels : requiredLabels).slice(0, limit);
  return joinHuman(labels);
}

// ¿La vacante pide formación técnica o ingeniería?
function requiereFormacionTecnica(data) {
  return data.model.requisitos.some((r) =>
    r.categoria === "escolaridad" && /tecnic|ingenieri/.test(normalize(r.texto)));
}

// Intro del perfil con concordancia natural según haya o no formación técnica.
function perfilIntro(data, conHabilidades) {
  const tecnica = requiereFormacionTecnica(data);
  if (conHabilidades) {
    return tecnica
      ? "Profesional con formación técnica y experiencia relacionada"
      : "Profesional con experiencia relacionada";
  }
  return tecnica ? "Profesional con formación técnica" : "Profesional";
}

function buildProfile(data) {
  const role = /^No /.test(data.model.puesto) ? "el puesto" : data.model.puesto;
  const skillPhrase = buildSkillPhrase(data, 5);
  const base = skillPhrase
    ? `${perfilIntro(data, true)} en ${skillPhrase}.`
    : `${perfilIntro(data, false)} con interés en ${role}.`;
  return `${base} Me caracterizo por responsabilidad, comunicación clara y disposición para aprender procesos nuevos con rapidez. Busco aportar a ${role} con compromiso y enfoque en resultados.`;
}

function createMessages(data) {
  const role = /^No /.test(data.model.puesto) ? "la vacante" : data.model.puesto;
  const city = (/^No /.test(data.model.ciudad) || data.model.ciudadAprox) ? "" : ` en ${data.model.ciudad}`;
  const skillPhrase = buildSkillPhrase(data, 3);
  const formacion = requiereFormacionTecnica(data) ? "formación técnica y " : "";
  const expClause = skillPhrase
    ? `Cuento con ${formacion}experiencia relacionada en ${skillPhrase}. `
    : "";

  return {
    comment: `Hola, buen día. Me interesa la vacante de ${role}${city}. ${expClause}¿Podrían confirmarme si sigue disponible y a dónde envío mi CV?`,
    inbox: `Hola, buen día. Vi su publicación sobre la vacante de ${role}${city} y me interesa postularme.\n\n${expClause}Me gustaría confirmar si la vacante sigue disponible, así como sueldo, horario, ubicación y los siguientes pasos del proceso.\n\nQuedo atento(a). Muchas gracias.`,
    whatsapp: `Hola, buen día. Le escribo por la vacante de ${role}${city} que vi en Facebook. ${expClause}¿Me podría confirmar si sigue disponible y a dónde puedo enviar mi CV? Gracias.`,
    profile: buildProfile(data)
  };
}

function createAdaptedCv(data) {
  const role = /^No /.test(data.model.puesto) ? "la vacante" : data.model.puesto;
  const company = /^No /.test(data.model.empresa) ? "la empresa" : data.model.empresa;
  const city = (/^No /.test(data.model.ciudad) || data.model.ciudadAprox) ? "" : ` en ${data.model.ciudad}`;
  const skillPhrase = buildSkillPhrase(data, 6) || "responsabilidad, organización y aprendizaje rápido";
  const matchedLabels = data.match.matchedSkills.map((s) => s.etiqueta);
  const habilidades = (matchedLabels.length
    ? matchedLabels
    : data.model.habilidadesRequeridas.map((s) => s.etiqueta)).slice(0, 8);
  const requisitosClave = data.model.requisitos
    .filter((r) => r.categoria === "habilidad" || r.categoria === "escolaridad")
    .map((r) => r.texto)
    .slice(0, 6);
  return `CV ADAPTADO A LA VACANTE

Puesto objetivo: ${role}${city}
Empresa: ${company}
Compatibilidad estimada: ${data.score}%

PERFIL PROFESIONAL
${perfilIntro(data, true)} en ${skillPhrase}. Me caracterizo por responsabilidad, comunicación clara y disposición para aprender procesos nuevos con rapidez. Busco aportar a ${company} con una actitud profesional, ordenada y orientada a resultados.

HABILIDADES RELEVANTES
${habilidades.length ? habilidades.map((skill) => `- ${titleCase(skill)}`).join("\n") : "- Comunicación clara\n- Organización\n- Atención al detalle\n- Aprendizaje rápido"}

EXPERIENCIA ALINEADA A LA VACANTE
${requisitosClave.length ? requisitosClave.map((req) => `- ${req}`).join("\n") : "- Actividades relacionadas con el puesto, con seguimiento y calidad."}

MENSAJE PARA RH
${createMessages(data).inbox}

RESPUESTAS A POSIBLES PREGUNTAS DE ENTREVISTA

1. ¿Por qué te interesa esta vacante?
Me interesa porque ${role} se relaciona con mi experiencia en ${skillPhrase}. Creo que puedo aportar desde el primer momento y seguir desarrollándome dentro del equipo.

2. ¿Qué experiencia tienes relacionada con el puesto?
Tengo experiencia o conocimientos en ${skillPhrase}, con enfoque en responsabilidad, atención al detalle y cumplimiento de tareas.

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
  renderList("#benefitsList", data.beneficios || [], "No se mencionan prestaciones o beneficios.");

  const messages = createMessages(data);
  document.querySelector("#commentMsg").value = messages.comment;
  document.querySelector("#inboxMsg").value = messages.inbox;
  document.querySelector("#whatsappMsg").value = messages.whatsapp;
  document.querySelector("#profileMsg").value = messages.profile;

  currentAdaptedCvText = createAdaptedCv(data);
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
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[£€]/g, "")
    .replace(/\bFequisitos\b/gi, "Requisitos")
    .replace(/\bfequisitos\b/gi, "requisitos")
    .replace(/\b0ficina\b/gi, "oficina")
    .replace(/\b0ffice\b/gi, "Office")
    .replace(/\b0l\s*izaci[oó]\s*ion\b/gi, "Organización")
    .replace(/\bO[lI]\s*izaci[oó]\s*ion\b/gi, "Organización")
    .replace(/\bSa\s+iN\b/gi, "sin")
    .replace(/\bpe:\b/gi, "")
    .replace(/\s+==+\s*/g, " ")
    .replace(/\s+[|]\s*/g, " ")
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

function preprocessCanvasForOcr(sourceCanvas) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  context.drawImage(sourceCanvas, 0, 0);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    const value = contrasted > 172 ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function cloneCanvas(sourceCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  canvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
  return canvas;
}

function cropCanvas(sourceCanvas, xRatio, yRatio, widthRatio, heightRatio) {
  const sx = Math.max(0, Math.round(sourceCanvas.width * xRatio));
  const sy = Math.max(0, Math.round(sourceCanvas.height * yRatio));
  const sw = Math.min(sourceCanvas.width - sx, Math.round(sourceCanvas.width * widthRatio));
  const sh = Math.min(sourceCanvas.height - sy, Math.round(sourceCanvas.height * heightRatio));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function trimLightBorder(sourceCanvas) {
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const data = image.data;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const index = (y * sourceCanvas.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const notBlank = alpha > 0 && !(red > 238 && green > 238 && blue > 238);
      if (notBlank) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return cloneCanvas(sourceCanvas);
  const padding = 18;
  const sx = Math.max(0, minX - padding);
  const sy = Math.max(0, minY - padding);
  const sw = Math.min(sourceCanvas.width - sx, maxX - minX + padding * 2);
  const sh = Math.min(sourceCanvas.height - sy, maxY - minY + padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

async function imageFileToCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 2600;
  const scale = Math.max(1, Math.min(3, maxWidth / bitmap.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function scoreOcrText(text, confidence = 0) {
  const normalizedText = normalize(text);
  const keywords = [
    "requisitos", "experiencia", "auxiliar", "administrativo", "office", "excel",
    "word", "whatsapp", "gmail", "cv", "preparatoria", "carrera", "tecnica",
    "sueldo", "horario", "interesados", "enviar", "equipo", "trabajo"
  ];
  const keywordScore = keywords.filter((keyword) => normalizedText.includes(keyword)).length * 24;
  const lengthScore = Math.min(220, normalizedText.length);
  const badSymbolPenalty = ((text.match(/[<>\\{}]/g) || []).length * 14) + ((text.match(/\b[a-z]\b/gi) || []).length * 4);
  return confidence + keywordScore + lengthScore - badSymbolPenalty;
}

function mergeOcrTexts(texts) {
  const lines = [];
  const seen = new Set();
  texts
    .join("\n")
    .split("\n")
    .map((line) => cleanExtractedText(line))
    .filter(Boolean)
    .forEach((line) => {
      const key = normalize(line).replace(/\s+/g, " ");
      if (key.length > 2 && !seen.has(key)) {
        seen.add(key);
        lines.push(line);
      }
    });
  return lines.join("\n");
}

async function recognizeCanvas(canvas, statusNode, label, passLabel, progressOffset, progressShare) {
  const result = await Tesseract.recognize(canvas, "spa+eng", {
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
    logger: (event) => {
      if (event.status === "recognizing text") {
        const progress = Math.round((progressOffset + (event.progress || 0) * progressShare) * 100);
        statusNode.textContent = `${label}: leyendo ${passLabel}... ${Math.min(99, progress)}%`;
      }
    }
  });
  return {
    text: result.data.text || "",
    confidence: result.data.confidence || 0,
    score: scoreOcrText(result.data.text || "", result.data.confidence || 0)
  };
}

async function recognizeImageSmart(file, statusNode, label) {
  const original = await imageFileToCanvas(file);
  const trimmed = trimLightBorder(original);
  const candidates = [
    { name: "imagen completa", canvas: trimmed },
    { name: "texto principal", canvas: cropCanvas(trimmed, 0, 0, 0.72, 0.78) },
    { name: "requisitos", canvas: cropCanvas(trimmed, 0, 0.18, 0.72, 0.6) },
    { name: "contacto", canvas: cropCanvas(trimmed, 0, 0.74, 1, 0.26) },
    { name: "alto contraste", canvas: preprocessCanvasForOcr(trimmed) }
  ];
  const results = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    results.push(await recognizeCanvas(
      candidate.canvas,
      statusNode,
      label,
      candidate.name,
      index / candidates.length,
      1 / candidates.length
    ));
  }

  results.sort((a, b) => b.score - a.score);
  const usefulTexts = results
    .filter((result, index) => index < 3 || scoreOcrText(result.text, result.confidence) > 120)
    .map((result) => result.text);
  return mergeOcrTexts(usefulTexts);
}

function setExtractedText(targetInput, rawText, statusNode, file, sourceName) {
  const text = sanitizeInputText(cleanExtractedText(rawText));
  if (!text) {
    statusNode.textContent = `No pude detectar texto claro en ${sourceName}. Intenta con una captura más nítida.`;
    return false;
  }
  targetInput.value = text;
  statusNode.textContent = `Archivo leído: ${describeFile(file)}. La app usará la información internamente.`;
  return true;
}

function looksLikeBadOcr(text) {
  const normalizedText = normalize(text);
  const usefulKeywords = [
    "requisitos", "experiencia", "office", "excel", "word", "whatsapp",
    "gmail", "cv", "sueldo", "horario", "contacto", "auxiliar", "administrativo"
  ];
  const usefulHits = usefulKeywords.filter((keyword) => normalizedText.includes(keyword)).length;
  const badSymbols = (text.match(/[<>\\{}]/g) || []).length;
  const oneLetterWords = (text.match(/\b[a-z]\b/gi) || []).length;
  return normalizedText.length < 45 || (usefulHits < 2 && badSymbols + oneLetterWords > 8);
}

async function ocrWithOcrSpace(file, statusNode, label) {
  statusNode.textContent = `${label}: leyendo con OCR en nube...`;
  const formData = new FormData();
  formData.append("apikey", OCR_SPACE_API_KEY);
  formData.append("file", file);
  formData.append("language", "spa");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("isTable", "true");
  formData.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData
  });
  if (!response.ok) throw new Error("OCR service unavailable");
  const data = await response.json();
  if (data.IsErroredOnProcessing) {
    throw new Error(Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(" ") : data.ErrorMessage || "OCR error");
  }
  const parsedText = (data.ParsedResults || [])
    .map((result) => result.ParsedText || "")
    .join("\n")
    .trim();
  if (!parsedText) throw new Error("OCR returned empty text");
  return parsedText;
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

  previewNode.classList.remove("hidden");
  previewNode.innerHTML = `
    <div class="file-preview-header">
      <div class="file-preview-title">${escapeHtml(file.name)}</div>
      <span class="file-preview-pill">Archivo cargado</span>
    </div>
    <div class="file-preview-body">${body}</div>
  `;
}

function hideDetectedText(targetInput) {
  const wrapper = targetInput.closest(".detected-text");
  if (wrapper) wrapper.classList.add("hidden");
}

function showDetectedText(targetInput) {
  const wrapper = targetInput.closest(".detected-text");
  if (wrapper) wrapper.classList.remove("hidden");
}

function handleTextFile(file, targetInput, statusNode) {
  showDetectedText(targetInput);
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
  hideDetectedText(targetInput);
  try {
    const text = await ocrWithOcrSpace(file, statusNode, label);
    if (setExtractedText(targetInput, text, statusNode, file, "la imagen")) {
      statusNode.textContent = `Archivo leído correctamente: ${describeFile(file)}`;
      showToast("Archivo leído");
    }
  } catch {
    targetInput.value = "";
    statusNode.textContent = "No pude leer la imagen con OCR externo. Revisa conexión o usa una captura más nítida.";
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
  const processedCanvas = preprocessCanvasForOcr(canvas);
  const results = [
    await recognizeCanvas(canvas, statusNode, label, `PDF ${pageNumber}/${totalPages}`, 0, 0.5),
    await recognizeCanvas(processedCanvas, statusNode, label, `PDF contraste ${pageNumber}/${totalPages}`, 0.5, 0.5)
  ];
  results.sort((a, b) => b.score - a.score);
  return mergeOcrTexts(results.map((result) => result.text));
}

async function handlePdfFile(file, targetInput, statusNode, label) {
  hideDetectedText(targetInput);
  statusNode.textContent = `${label}: leyendo PDF...`;
  try {
    const cloudText = await ocrWithOcrSpace(file, statusNode, label);
    if (setExtractedText(targetInput, cloudText, statusNode, file, "el PDF")) {
      statusNode.textContent = `Archivo leído correctamente: ${describeFile(file)}`;
      showToast("Archivo leído");
      return;
    }
  } catch {
    targetInput.value = "";
    statusNode.textContent = "No pude leer el PDF con OCR externo. Intenta exportarlo como imagen clara o TXT.";
  }
}

function handlePickedFile(event, targetInput, statusNode, previewNode, label) {
  const file = event.target.files?.[0];
  if (!file) return;
  const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const validationError = validateFile(file, isImage || isPdf);
  if (validationError) {
    event.target.value = "";
    statusNode.textContent = validationError;
    showToast(validationError);
    return;
  }

  renderFilePreview(file, targetInput, previewNode);

  if (isText) {
    showDetectedText(targetInput);
    handleTextFile(file, targetInput, statusNode);
    return;
  }
  if (isPdf) {
    hideDetectedText(targetInput);
    handlePdfFile(file, targetInput, statusNode, label);
    return;
  }
  if (isImage) {
    hideDetectedText(targetInput);
    handleImageFile(file, targetInput, statusNode, label);
    return;
  }

  statusNode.textContent = `${label}: ${describeFile(file)}. Por ahora DOC/DOCX no se leen solos; usa PDF, captura o TXT.`;
  showToast("Archivo seleccionado");
}

analyzeBtn.addEventListener("click", () => {
  const cv = sanitizeInputText(cvInput.value);
  const job = sanitizeInputText(jobInput.value);
  cvInput.value = cv;
  jobInput.value = job;
  const validationError = validateAnalysisInputs(cv, job);
  if (validationError) {
    showToast(validationError);
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
  showDetectedText(cvInput);
  showDetectedText(jobInput);
  cvFilePreview.classList.add("hidden");
  jobFilePreview.classList.add("hidden");
  cvFilePreview.innerHTML = "";
  jobFilePreview.innerHTML = "";
  cvFileStatus.textContent = "Puedes adjuntar PDF, TXT o foto. Imágenes/PDFs se leen con OCR externo y no se muestra la transcripción.";
  jobFileStatus.textContent = "Puedes adjuntar captura, PDF o TXT. Imágenes/PDFs se leen con OCR externo y no se muestra la transcripción.";
  results.classList.add("hidden");
  cvInput.focus();
});

roleSelect.addEventListener("change", () => {
  if (roleSelect.value === "user") {
    currentRole = "user";
    localStorage.setItem(ROLE_KEY, currentRole);
    adminPin.value = "";
  }
  if (roleSelect.value === "admin" && currentRole !== "admin") {
    adminPinWrap.classList.remove("hidden");
    unlockAdminBtn.classList.remove("hidden");
    accessStatus.textContent = "Ingresa el PIN admin para activar permisos.";
    adminPin.focus();
    return;
  }
  applyRole();
});

unlockAdminBtn.addEventListener("click", () => {
  const savedPin = localStorage.getItem(ADMIN_PIN_KEY);
  if (!savedPin) {
    if (adminPin.value.length < 4) {
      showToast("Crea un PIN admin de mínimo 4 dígitos");
      return;
    }
    localStorage.setItem(ADMIN_PIN_KEY, adminPin.value);
    currentRole = "admin";
    localStorage.setItem(ROLE_KEY, currentRole);
    roleSelect.value = "admin";
    adminPin.value = "";
    applyRole();
    showToast("PIN admin creado");
    return;
  }
  if (adminPin.value !== savedPin) {
    showToast("PIN admin incorrecto");
    return;
  }
  currentRole = "admin";
  localStorage.setItem(ROLE_KEY, currentRole);
  roleSelect.value = "admin";
  adminPin.value = "";
  applyRole();
  showToast("Modo administrador activado");
});

clearHistoryBtn.addEventListener("click", () => {
  if (currentRole !== "admin") {
    showToast("Solo administrador puede borrar historial");
    return;
  }
  if (!confirm("¿Borrar todo el historial guardado en este navegador?")) return;
  saveHistory([]);
  renderHistory();
  showToast("Historial borrado");
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

applyRole();
renderHistory();
