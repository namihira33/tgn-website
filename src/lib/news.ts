import { getCollection } from 'astro:content';

export type CategoryType = 'info' | 'event' | 'note' | 'report';

export interface UnifiedNewsItem {
  id: string;
  title: string;
  date: Date;
  description?: string;
  categories: CategoryType[];
  href: string;
  isExternal: boolean;
  image?: string;
}

// noteのRSSフィードを取得
export async function fetchNoteArticles(): Promise<UnifiedNewsItem[]> {
  try {
    const response = await fetch('https://note.com/tkbgradnet/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TGN-Website/1.0)',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch note RSS:', response.status);
      return [];
    }

    const xml = await response.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

    return items.map((item, index) => {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
                    item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] ||
                          item.match(/<description>(.*?)<\/description>/)?.[1] || '';

      // media:thumbnail の取得（属性からURLを取得）
      const thumbnailMatch = item.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
      // または enclosure から画像を取得
      const enclosureMatch = item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image/);
      const image = thumbnailMatch?.[1] || enclosureMatch?.[1] || '';

      const cleanDescription = description
        .replace(/<[^>]*>/g, '')
        .substring(0, 100);

      // note記事はデフォルトで活動報告扱い
      const categories: CategoryType[] = ['note'];

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

// ローカルのNEWS記事を取得（告知系）
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

// NEWS用：告知・新情報（ローカル記事のみ、note記事は含まない）
// 管理画面投稿はクライアントサイドで追加取得
export async function getUnifiedNews(): Promise<UnifiedNewsItem[]> {
  const localNews = await fetchLocalNews();
  return localNews.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// 活動報告用：ローカルブログ + note記事
export async function getActivityReports(): Promise<UnifiedNewsItem[]> {
  const [noteArticles, blogPosts] = await Promise.all([
    fetchNoteArticles(),
    getCollection('blog'),
  ]);

  const localBlog: UnifiedNewsItem[] = blogPosts.map(post => ({
    id: post.id,
    title: post.data.title,
    date: new Date(post.data.date),
    description: post.data.description,
    categories: [post.data.category === 'report' ? 'report' : 'info'] as CategoryType[],
    href: `/blog/${post.id}`,
    isExternal: false,
    image: post.data.image,
  }));

  const allItems = [...noteArticles, ...localBlog];
  return allItems.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}
