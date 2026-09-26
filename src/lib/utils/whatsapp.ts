export interface WhatsAppShareOptions {
  phone?: string;
  message: string;
}

/**
 * Construye la URL de WhatsApp.
 * - Si hay teléfono: intenta abrir la app nativa con whatsapp://send.
 * - Si no hay teléfono: usa wa.me (web) porque whatsapp:// no soporta sin destinatario.
 * - Limpia el teléfono: quita todo lo que no sea dígito y quita ceros iniciales.
 */
export function buildWhatsAppLink({
  phone,
  message,
}: WhatsAppShareOptions): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/**
 * Abre WhatsApp con un mensaje prellenado.
 *
 * Estrategia:
 * - En móvil (Android/iOS): usa whatsapp://send que abre la app directo.
 * - En escritorio CON teléfono: intenta whatsapp://send para abrir la app
 *   nativa (evita la página intermedia de WhatsApp Web). Si tras 1.5s la app
 *   no se abrió, hace fallback a https://wa.me.
 * - En escritorio SIN teléfono: usa wa.me directamente (whatsapp:// no
 *   soporta abrir sin destinatario de forma fiable).
 */
export function shareOnWhatsApp(options: WhatsAppShareOptions): void {
  const { phone, message } = options;
  const encoded = encodeURIComponent(message);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Móvil: whatsapp:// abre la app directamente
  if (isMobile) {
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
      window.location.href = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
    } else {
      window.location.href = `whatsapp://send?text=${encoded}`;
    }
    return;
  }

  // Escritorio con teléfono: intenta app nativa con fallback
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0+/, '');
    const appUrl = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;
    const webUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;

    // Fallback: si en 1.5s la pestaña sigue visible, la app no se abrió
    const start = Date.now();
    const timer = setTimeout(() => {
      if (Date.now() - start < 2000 && !document.hidden) {
        window.open(webUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1500);

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    window.location.href = appUrl;
    return;
  }

  // Escritorio sin teléfono: usa wa.me directo
  const webUrl = `https://wa.me/?text=${encoded}`;
  window.open(webUrl, '_blank', 'noopener,noreferrer');
}

export function buildCatalogMessage(
  businessName: string,
  catalogUrl: string,
  customMessage?: string
): string {
  // El link va solo en su propia linea para que WhatsApp lo detecte
  const lines: string[] = [];
  if (customMessage && customMessage.trim()) {
    lines.push(customMessage.trim());
  } else {
    lines.push(`Hola, te comparto nuestro catalogo actualizado de ${businessName}:`);
  }
  lines.push('');
  lines.push(catalogUrl);
  return lines.join('\n');
}

export function buildProductMessage(
  businessName: string,
  productName: string,
  productUrl: string,
  price?: string
): string {
  const lines: string[] = [];
  lines.push(`Hola, te comparto este producto de ${businessName}:`);
  lines.push('');
  lines.push(`*${productName}*`);
  if (price) lines.push(`Precio: ${price}`);
  lines.push('');
  lines.push(productUrl);
  return lines.join('\n');
}

export function buildCategoryMessage(
  businessName: string,
  categoryName: string,
  categoryUrl: string
): string {
  const lines: string[] = [];
  lines.push(`Hola, mira los productos de *${categoryName}* en ${businessName}:`);
  lines.push('');
  lines.push(categoryUrl);
  return lines.join('\n');
}

export function buildPointsMessage(
  customerName: string,
  points: number,
  valueText: string | null,
  pointsUrl: string
): string {
  const lines: string[] = [];
  if (valueText) {
    lines.push(
      `Hola ${customerName}, tienes ${points} puntos acumulados (equivalentes a ${valueText}).`
    );
  } else {
    lines.push(`Hola ${customerName}, tienes ${points} puntos acumulados.`);
  }
  lines.push('');
  lines.push('Mira tus puntos aqui:');
  lines.push(pointsUrl);
  return lines.join('\n');
}

export function buildRedemptionCodeMessage(
  customerName: string,
  code: string
): string {
  const lines: string[] = [];
  lines.push(
    `Hola ${customerName}, tu codigo para canjear tus puntos es: ${code}.`
  );
  lines.push('');
  lines.push(
    'Valido por unos minutos. Muestralo al vendedor cuando estes en la tienda.'
  );
  return lines.join('\n');
}