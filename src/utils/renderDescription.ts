import { marked } from 'marked'

/**
 * Renders a raw markdown string into the given container element.
 */
export const renderDescription = async (
  container: HTMLElement,
  markdown: string
): Promise<void> => {
  container.innerHTML = await marked.parse(markdown)
}
