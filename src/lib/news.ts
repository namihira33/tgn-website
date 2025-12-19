import { getCollection } from 'astro:content';

export interface UnifiedNewsItem {
  id: string;
  title: string;
  date: Date;
  description?: string;
  category: 'info' | 'event' | 'note';
  href: string;
  isExternal: boolean;
}

// noteのRSSフィードを取得
async function fetchNoteArticles(): Promise<UnifiedNewsItem[]> {
  try {
    const response = await fetch('https://note.com/tkbgradnet/rss');
    const xml = await response.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    return items.map((item, index) => {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                    item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                          item.match(/<description>(.*?)<\/description>/)?.[1] || '';

      // HTMLタグを除去して短縮
      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .substring(0, 100);

      return {
        id: `note-${index}`,
        title,
        date: new Date(pubDate),
        description: cleanDescription,
        category: 'note' as const,
        href: link,
        isExternal: true,
      };
    });
  } catch (error) {
    console.error('Failed to fetch note RSS:', error);
    return [];
  }
}

// ローカルのNEWS記事を取得
async function fetchLocalNews(): Promise<UnifiedNewsItem[]> {
  const allNews = await getCollection('news');

  return allNews.map(news => ({
    id: news.id,
    title: news.data.title,
    date: new Date(news.data.date),
    description: news.data.description,
    category: news.data.category as 'info' | 'event',
    href: `/news/${news.id}`,
    isExternal: false,
  }));
}

// 統合してソート
export async function getUnifiedNews(): Promise<UnifiedNewsItem[]> {
  const [noteArticles, localNews] = await Promise.all([
    fetchNoteArticles(),
    fetchLocalNews(),
  ]);

  const allItems = [...noteArticles, ...localNews];

  // 日付で降順ソート
  return allItems.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}
