/**
 * Reads full article content from URLs using z-ai-web-dev-sdk web-reader.
 * This gives us much richer content than just search snippets.
 */
import { getSDK } from './sdk';

interface ArticleContent {
  title: string;
  content: string;  // First ~2000 chars
  url: string;
  publishedTime?: string;
}

export async function readArticle(url: string): Promise<ArticleContent | null> {
  try {
    const zai = await getSDK();
    const result = await zai.functions.invoke('web_reader', { url });

    if (!result) return null;

    return {
      title: result.title || '',
      content: (result.html || result.content || '').slice(0, 2000),
      url,
      publishedTime: result.published_time,
    };
  } catch {
    return null;
  }
}

/**
 * Read multiple articles in parallel with timeout
 */
export async function readArticles(urls: string[], maxArticles = 3): Promise<ArticleContent[]> {
  const results = await Promise.allSettled(
    urls.slice(0, maxArticles).map(url => readArticle(url))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ArticleContent | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((a): a is ArticleContent => a !== null);
}
