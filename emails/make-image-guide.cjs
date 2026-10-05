// Generates ../../RODI-guia-de-imagenes-v2.md and .csv (the image guide for the portal). node make-image-guide.cjs
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "..");

// [grupo, imagen, donde se ve, proporcion, medida a entregar (px), formato y peso, cantidad, estado hoy, como/donde se sube]
const R = [];
const add = (...a) => R.push(a);

// ---- MARCA
add("1. Marca", "Imagen para compartir en redes", "Vista previa al compartir enlaces (WhatsApp, redes)", "1,91:1", "1200 × 630", "JPG, ≤ 300 KB", "1", "NO existe en este theme: hay que añadir el ajuste (lo hago yo)", "Pendiente: se configura en el theme");

// ---- HOME
add("2. Inicio", "Hero: video", "Portada, ocupa casi toda la pantalla (92% del alto, máx. 880 px)", "16:9", "1920 × 1080", "MP4 H.264, sin audio, 8–15 s en bucle, ≤ 6 MB", "1", "Hay: rodi-hero.mp4 (190 KB, de prueba)", "Theme → Personalizar → Inicio → sección Hero → Video");
add("2. Inicio", "Hero: imagen de respaldo (móvil / mientras carga)", "Portada, detrás del video; en móvil se recorta al centro", "16:9 (se recorta a vertical en móvil)", "2560 × 1440. Sujeto en el centro", "WebP o JPG, ≤ 350 KB", "1", "No hay imagen propia", "Theme → Personalizar → Inicio → Hero → Imagen");
add("2. Inicio", "Manifiesto", "Portada, bloque \"manifiesto\"", "4:5 (vertical)", "1600 × 2000", "WebP o JPG, ≤ 400 KB", "1", "lisboa1.png (1024 × 1536, 2,7 MB, de prueba)", "Theme → Personalizar → Inicio → Manifiesto → Imagen");
add("2. Inicio", "Journal (3 tarjetas)", "Portada, tarjetas del Journal", "8:5 (horizontal)", "1600 × 1000 cada una", "WebP o JPG, ≤ 300 KB c/u", "3", "marruecos2, grecia2, turquia2 (PNG verticales de 2 MB, se recortan mal)", "Archivos del theme (los reemplazo yo)");
add("2. Inicio", "Fondo de la pantalla sin sesión (Club)", "Dashboard del Club cuando no has iniciado sesión", "16:9", "2400 × 1350", "WebP o JPG, ≤ 350 KB", "1", "No hay imagen propia", "Theme → Personalizar → Dashboard → Imagen de fondo");

// ---- HEROES CLUB
const heroes = [
  ["Alertas", "page.alertas", "rodi-hero-rio.webp"], ["Pregunta al Club", "page.ask-the-club", "rodi-hero-vik.webp"], ["Beneficios", "page.beneficios", "rodi-hero-bruges.webp"],
  ["Presupuesto", "page.presupuesto", "rodi-hero-prague.webp"], ["Calculadora de viaje", "page.calculadora-de-viaje", "rodi-hero-london.webp"], ["Destinos", "page.destinations", "rodi-hero-sydney.webp"],
  ["Modo emergencia", "page.modo-emergencia", "rodi-hero-rome.webp"], ["Exportar viaje", "page.exportar-viaje", "rodi-hero-agra.webp"], ["Itinerario", "page.itinerario", "rodi-hero-dubai.webp"],
  ["Mi diario", "page.mi-diario", "rodi-hero-vik.webp"], ["Pasaporte", "page.passport", "rodi-hero-barcelona.webp"], ["Mis servicios", "page.mis-servicios", "rodi-hero-prague.webp"],
  ["Packing", "page.packing", "rodi-hero-sydney.webp"], ["Perfil", "page.perfil", "rodi-hero-paris.webp"], ["Recomendaciones", "page.recomendaciones", "rodi-hero-cartagena.webp"],
  ["Guardados", "page.guardados", "rodi-hero-newyork.webp"], ["Servicios", "page.services", "rodi-hero-prague.webp"], ["Split de gastos", "page.split-gastos", "rodi-hero-capetown.webp"], ["Mis viajes", "page.mis-viajes", "rodi-hero-kyoto.webp"],
];
for (const [name, tpl, file] of heroes) {
  add("3. Banners de las páginas del Club (19 páginas)", `Banner: ${name}`, `Franja superior de la página ${name} (${tpl})`, "3:1 (panorámica)", "2400 × 800. Sujeto en la franja central: arriba y abajo se recorta", "WebP, ≤ 300 KB", "1", `Hay: ${file} (2000 × 667)`, `Theme → Personalizar → ${name} → Imagen del hero. O reemplazar el archivo ${file} (cambia todas las páginas que lo comparten)`);
}

// ---- TIENDA / CHAPTERS
add("4. Tienda y Chapters", "Fotos de Chapters / objetos (provisionales)", "Hub de Chapters, vista previa de la tienda, Essentials, Objetos, \"también te puede gustar\" del carrito", "4:5 (vertical)", "1600 × 2000 cada una", "WebP o JPG, ≤ 400 KB c/u", "9", "grecia1, grecia2, lisboa1, marruecos1, marruecos2, nueva_york1, spain1, turquia1, turquia2 (PNG de ~2 MB, de prueba)", "Archivos del theme (los reemplazo yo). Cuando los Chapters sean productos reales, salen de las fotos del producto");
add("4. Tienda y Chapters", "Banner del carrito", "Cabecera del carrito lateral y banner del Chapter en el carrito", "16:9", "1600 × 900", "WebP o JPG, ≤ 250 KB", "1", "Hay: rodi-hero-cartagena.webp (2000 × 667)", "Theme → Personalizar → Carrito → banner (campo \"nombre del archivo\")");

// ---- PRODUCTOS
add("5. Productos", "Fotos de producto", "Ficha de producto, tarjetas, carrito y correos de carrito, pedido, nuevos productos y descuento", "4:5 (vertical)", "1600 × 2000 cada una. Fondo limpio y mismo encuadre en todos", "WebP o JPG, ≤ 400 KB c/u", "4 a 6 por producto (frontal, trasera, detalle, puesto, contexto)", "1 producto de prueba (\"Test — Azulejo Tee\")", "Shopify Admin → Productos → cada producto → Medios");

// ---- DESTINOS
add("6. Destinos y contenido", "Foto de país", "Banner de la página del país (ancho completo, hasta 560 px de alto) y tarjetas de destinos destacados (3:4)", "3:2 (centrar el sujeto: se recorta a panorámica y a vertical)", "2400 × 1600", "WebP o JPG, ≤ 350 KB", "199 países (hoy 2: Portugal y Marruecos). Mínimo para lanzar: los 20 destinos principales", "Con foto: Portugal, Marruecos. Sin foto: 197 (la página funciona, solo sin imagen)", "Shopify Admin → Contenido → Metaobjetos → País → campo Hero image");
add("6. Destinos y contenido", "Foto de ciudad", "Tarjetas de ciudades dentro de la página del país", "4:5 (vertical)", "1600 × 2000", "WebP o JPG, ≤ 350 KB", "1 por ciudad (hoy 1 ciudad: Marrakech, con foto)", "Con foto: Marrakech", "Metaobjetos → Ciudad → Hero image");
add("6. Destinos y contenido", "Foto de servicio", "Tarjeta y página de cada servicio de RODI Services", "3:2", "1800 × 1200", "WebP o JPG, ≤ 250 KB", "8 (trip-review, trip-build, concierge, rodi-express, destination-pack, rodi-routes, document-checklist-review, packing-pro)", "Ninguna: usa imágenes de respaldo del theme", "Metaobjetos → Servicio → Hero image");
add("6. Destinos y contenido", "Foto de recomendación de la comunidad", "Tarjetas de recomendaciones", "4:3", "1600 × 1200", "WebP o JPG, ≤ 250 KB", "Opcional, 1 por recomendación (hoy 2, sin foto)", "Ninguna", "Metaobjetos → Recomendación → Image");

// ---- BENEFICIOS
add("7. Beneficios (logos)", "Logos de herramientas recomendadas", "Página de Beneficios: Google Maps, Google Translate, SmartEX, Klook", "1:1", "512 × 512, fondo transparente", "PNG transparente (o SVG), ≤ 60 KB", "4", "NO hay", "Theme → Personalizar → Beneficios → bloque \"toolkit\" → Logo");

// ---- OTROS
add("8. Otros", "Fondo de la página de contraseña / \"próximamente\"", "Pantalla completa mientras la tienda tiene contraseña", "16:9 (cubre toda la pantalla)", "2560 × 1440", "WebP o JPG, ≤ 400 KB", "1", "Hay: rodi-coming-soon.webp (1402 × 1122, baja resolución para pantalla completa)", "Archivo del theme (lo reemplazo yo)");
add("8. Otros", "Mapa mundial del pasaporte", "Pasaporte del Club", "2754:1398", "Vectorial", "SVG (hoy 531 KB; se puede optimizar)", "1", "Hay: rodi-world-map.svg", "Archivo del theme");

// ---- CORREOS
add("9. Correos (reemplazar provisionales)", "Iconos de línea", "Columnas y listas de los correos (brújula, pin, cámara, regalo, usuarios, globo, diamante, libro, avión, estrella, etiqueta, candado, campana, camión, caja, maletín)", "1:1", "96 × 96, fondo transparente, trazo fino dorado #A88543", "PNG, ≤ 5 KB c/u", "16", "Hay 16 provisionales (dibujados por mí)", "Me los pasas y los cambio yo");
add("9. Correos (reemplazar provisionales)", "Fotos grandes de correos", "Cabecera de los correos (comparte experiencias, refiere, te extrañamos, oferta, beneficios, descuento, nuevos productos, Chapter, carrito, pedido, bienvenida, cuenta lista, código)", "2:1", "1200 × 600. Deja zona despejada (en algunos los textos van encima)", "JPG (no WebP: Outlook no lo muestra), ≤ 150 KB", "5 (grecia, roma, barcelona, lisboa, brujas)", "Hay 5 provisionales recortadas del theme (algunas con rótulos de ciudad incrustados)", "Me las pasas y las cambio yo");
add("9. Correos (reemplazar provisionales)", "Miniaturas de correos", "Columnas del correo \"Comparte tus experiencias\"", "11:12 (casi cuadrada)", "440 × 480", "JPG, ≤ 60 KB c/u", "3", "Hay 3 provisionales", "Me las pasas y las cambio yo");

const head = ["Grupo", "Imagen", "Dónde se ve", "Proporción", "Medida a entregar (px)", "Formato y peso", "Cantidad", "Estado hoy", "Cómo / dónde se sube"];
const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(OUT, "RODI-guia-de-imagenes-v2.csv"), "﻿" + [head, ...R].map((r) => r.map(q).join(";")).join("\r\n"));

let md = "# Guía de imágenes del portal RODI\n\nActualizada el 5 de octubre de 2026. Las medidas son para entregar la imagen **final** (la pantalla la reduce o recorta sola). Casi todas las imágenes que existen hoy son de prueba.\n\n";
md += "## Reglas generales\n\n";
md += "- **Fotos:** WebP o JPG, calidad ~80. Nunca PNG para fotos: los PNG actuales pesan ~2 MB y ralentizan el sitio.\n";
md += "- **Logos de RODI y los 5 de socios que ya existen (Holafly, Booking.com, GetYourGuide, Plenti, ARQ):** se quedan como están; no hay que entregarlos otra vez.\n";
md += "- **Logos nuevos con fondo transparente:** PNG o SVG.\n";
md += "- **Correos:** solo JPG y PNG (Gmail y Outlook no muestran WebP ni SVG).\n";
md += "- **Recorte:** casi todas las imágenes llenan su espacio y se recortan (`cover`). Deja el sujeto principal **centrado** y con aire en los bordes.\n";
md += "- **Peso:** cada foto de página ≤ 400 KB.\n";
md += "- **Texto dentro de las imágenes:** evitarlo (se recorta y no se traduce a los 4 idiomas).\n";
let g = "";
for (const r of R) {
  if (r[0] !== g) {
    g = r[0];
    md += `\n## ${g}\n\n| Imagen | Dónde se ve | Proporción | Medida (px) | Formato y peso | Cantidad | Estado hoy | Cómo se sube |\n|---|---|---|---|---|---|---|---|\n`;
  }
  md += `| ${r.slice(1).map((c) => String(c).replace(/\|/g, "/")).join(" | ")} |\n`;
}
md += "\n## Resumen de cantidades\n\n| Grupo | Qué falta o se debe reemplazar |\n|---|---|\n";
md += "| Marca | 1 por entregar: la imagen para compartir en redes (el favicon ya está hecho con la R sobre fondo marfil; los logos de RODI se quedan como están) |\n";
md += "| Inicio | 7: video, imagen de respaldo, manifiesto, 3 del Journal, fondo sin sesión |\n";
md += "| Banners del Club | 15 archivos distintos (o 19 si cada página tiene el suyo) |\n";
md += "| Tienda y Chapters | 10: 9 fotos + 1 banner de carrito |\n";
md += "| Productos | 4 a 6 por producto |\n";
md += "| Destinos y contenido | 197 países sin foto (mínimo 20 para lanzar), 8 servicios, ciudades según se agreguen, recomendaciones opcionales |\n";
md += "| Beneficios | 4 logos nuevos (los 5 existentes se quedan) |\n";
md += "| Otros | 1 fondo de la página de contraseña |\n";
md += "| Correos | 24: 16 iconos, 5 fotos grandes, 3 miniaturas (el logo se queda) |\n";
md += "\n**Mínimo para lanzar sin que se note lo provisional:** imagen para compartir, video y hero de inicio, banners del Club, fotos reales de producto, 8 fotos de servicios, 20 países, 4 logos de herramientas y las 5 fotos grandes de correos.\n";
fs.writeFileSync(path.join(OUT, "RODI-guia-de-imagenes-v2.md"), md);
console.log("filas:", R.length, "| md:", md.length, "caracteres");
