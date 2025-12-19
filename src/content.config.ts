import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['info', 'event']).default('info'),
    description: z.string().optional(),
    image: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['report', 'column']).default('report'),
    description: z.string().optional(),
    image: z.string().optional(),
    author: z.string().optional(),
  }),
});

export const collections = { news, blog };
