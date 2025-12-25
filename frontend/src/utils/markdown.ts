import { marked } from 'marked';

// Configure marked for consistent output
marked.setOptions({
  gfm: true,          // GitHub Flavored Markdown
  breaks: true,       // Convert line breaks to <br> tags
});

// Enhanced markdown to HTML converter using marked library
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  // Protect commitfest tags container before markdown processing
  // Use a unique placeholder that won't be processed by markdown
  const commitfestTagsRegex = /<div class="commitfest-tags-container">[\s\S]*?<\/div>/gi
  const commitfestTags: string[] = []
  let commitfestIndex = 0
  let protectedMarkdown = markdown.replace(commitfestTagsRegex, (match) => {
    commitfestTags.push(match)
    // Use a unique placeholder that won't be interpreted by markdown
    return `<!--COMMITFEST_TAGS_PLACEHOLDER_${commitfestIndex++}-->`
  })
  
  // Use marked library for reliable markdown conversion
  let html = marked(protectedMarkdown) as string;
  
  // Restore protected commitfest tags - use a more robust replacement
  commitfestTags.forEach((tags, index) => {
    const placeholder = `<!--COMMITFEST_TAGS_PLACEHOLDER_${index}-->`
    // Replace all occurrences in case there are multiple
    html = html.split(placeholder).join(tags)
  })
  
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
