# Facebook CV Assistant

App web estática para analizar vacantes publicadas en grupos de Facebook y preparar mensajes para copiar sin enviarlos automáticamente.

## Cómo correrla en tu computadora

1. Abre la carpeta `facebook-cv-assistant`.
2. Da doble clic en `index.html`.
3. Se abrirá en tu navegador.
4. Pega tu CV en el primer campo.
5. Pega la publicacion de Facebook en el segundo campo.
6. También puedes usar `Examinar archivo` para seleccionar PDF, TXT o una foto/captura. Los TXT y PDF con texto se cargan automáticamente; las imágenes se leen con OCR en el navegador.
7. Haz clic en `Analizar vacante`.
8. Revisa compatibilidad, requisitos, alertas y recomendación.
9. Usa los botones `Copiar` para llevarte el comentario, inbox, WhatsApp o perfil mejorado.
10. Revisa el CV adaptado, con perfil profesional, habilidades, experiencia mejor redactada, mensaje para RH y respuestas de entrevista.
11. Descarga el CV adaptado en `.txt` o `.docx`.
12. Revisa el historial para cambiar estado y agregar notas de seguimiento.

## Semáforo de riesgo

- Verde: se ve normal.
- Amarillo: revisar antes de avanzar.
- Rojo: posible fraude.

La app marca alertas si detecta sueldo demasiado alto para poca experiencia, cobros, depósito, INE antes de entrevista, promesas de visa o viaje sin empresa clara, correos raros, falta de nombre de empresa, muchas faltas, datos bancarios o WhatsApp personal sin información de empresa.

## Importante

- No necesita backend.
- No instala dependencias.
- No envía mensajes automáticamente.
- Todo el análisis ocurre en tu navegador.
- Es una primera versión basada en palabras clave y reglas simples.
- El historial se guarda con `localStorage` en el navegador donde abras la app.
- La interfaz ya incluye espacios laterales para anuncios. Reemplázalos por el código de AdSense cuando Google apruebe el sitio.
