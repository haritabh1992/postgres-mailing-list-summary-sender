import { marked } from 'marked';

// Configure marked for consistent output
marked.setOptions({
  gfm: true,          // GitHub Flavored Markdown
  breaks: true,       // Convert line breaks to <br> tags
});

// Enhanced markdown to HTML converter using marked library
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  // Use marked library for reliable markdown conversion
  let html = marked(markdown) as string;
  
  // Add target="_blank" to external links for better UX
  html = html.replace(/<a href="([^"]+)"/g, '<a href="$1" target="_blank"');
  
  return html;
}

// Truncate HTML content while preserving tags
export function truncateHtml(html: string, maxLength: number): string {
  if (html.length <= maxLength) return html;
  
  // Remove HTML tags for length calculation
  const textContent = html.replace(/<[^>]*>/g, '');
  
  if (textContent.length <= maxLength) return html;
  
  // Find a good breaking point
  let truncated = html.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated + '...';
}
