// Flooring / wallpaper icons and fallback furniture art from the Shop Titans
// Fandom wiki, through its MediaWiki API.
import { fetchJson } from './http.ts';

export const WIKI_API = 'https://shop-titans.fandom.com/api.php';

interface CategoryMembers {
  query: { categorymembers: { title: string }[] };
  continue?: { cmcontinue: string };
}

interface ImageInfo {
  query: { pages: Record<string, { title: string; imageinfo?: { url: string }[] }> };
}

export async function categoryFiles(category: string): Promise<string[]> {
  const titles: string[] = [];
  let cont: string | undefined;
  do {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmtype: 'file',
      cmlimit: '500',
      format: 'json',
    });
    if (cont) params.set('cmcontinue', cont);
    const data = await fetchJson<CategoryMembers>(`${WIKI_API}?${params}`);
    titles.push(...data.query.categorymembers.map((m) => m.title));
    cont = data.continue?.cmcontinue;
  } while (cont);
  return titles;
}

/** Maps "File:X.png" titles to their full-size image URLs. */
export async function fileUrls(titles: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({
      action: 'query',
      titles: titles.slice(i, i + 50).join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    });
    const data = await fetchJson<ImageInfo>(`${WIKI_API}?${params}`);
    for (const page of Object.values(data.query.pages)) {
      const url = page.imageinfo?.[0]?.url;
      if (url) urls.set(page.title, url);
    }
  }
  return urls;
}

/** "File:Academy Tile.png" → "Academy Tile". */
export const fileTitleToName = (title: string) => title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
