import { getCollection } from 'astro:content';

export type CategoryType = 'info' | 'event' | 'note';

export interface UnifiedNewsItem {
  id: string;
  title: string;
  date: Date;
  description?: string;
  categories: CategoryType[]; // 複数カテゴリ対応
  href: string;
  isExternal: boolean;
  image?: string; // サムネイル画像
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
      // media:thumbnail から画像を取得
      const image = item.match(/<media:thumbnail>(.*?)<\/media:thumbnail>/)?.[1] || '';

      // HTMLタグを除去して短縮
      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .substring(0, 100);

      // タイトルからカテゴリを推測（イベント系のキーワードがあれば event も追加）
      const categories: CategoryType[] = ['note'];
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('イベント') || lowerTitle.includes('開催') ||
          lowerTitle.includes('募集') || lowerTitle.includes('参加者')) {
        categories.push('event');
      }

      return {
        id: `note-${index}`,
        title,
        date: new Date(pubDate),
        description: cleanDescription,
        categories,
        href: link,
        isExternal: true,
        image: image || undefined,
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
    categories: [news.data.category as CategoryType],
    href: `/news/${news.id}`,
    isExternal: false,
    image: news.data.image,
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
