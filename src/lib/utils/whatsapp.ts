export interface WhatsAppShareOptions {
  phone?: string;
  message: string;
}

export function buildWhatsAppLink({
  phone,
  message,
}: WhatsAppShareOptions): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function shareOnWhatsApp(options: WhatsAppShareOptions): void {
  const url = buildWhatsAppLink(options);
  window.open(url, '_blank', 'noopener,noreferrer');
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