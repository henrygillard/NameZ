// @ts-check
import axios from "axios";

const TRIAL_BASE = "https://api.upcitemdb.com/prod/trial/search";
const PAID_BASE  = "https://api.upcitemdb.com/prod/v1/search";

/**
 * Search UPCItemDB by product name/keyword.
 * Uses the paid endpoint when UPCITEMDB_KEY is set, otherwise the free trial tier.
 * Returns { title, images, offers, items } shaped like lookupByKeyword, or null.
 */
export async function lookupByName(query) {
  const userKey = process.env.UPCITEMDB_KEY;
  const url     = userKey ? PAID_BASE : TRIAL_BASE;

  const headers = { Accept: "application/json" };
  if (userKey) headers["user_key"] = userKey;

  const { data } = await axios.get(url, {
    params: { s: query, type: "product" },
    headers,
    timeout: 8000,
  });

  if (!data.items?.length) return null;

  const items = data.items.map((item) => {
    // Normalise merchant offers — price can be 0 or missing; filter later
    const offers = (item.offers ?? [])
      .map((o) => ({
        merchant: o.merchant || o.domain || "Retailer",
        price: parseFloat(o.price) || 0,
        listPrice: parseFloat(o.list_price) || 0,
        link: o.link || null,
        condition: o.condition || null,
        source: "misc",
      }))
      .filter((o) => o.price > 0);

    return {
      title:       item.title       || null,
      description: item.description || null,
      brand:       item.brand       || null,
      model:       item.model       || null,
      color:       item.color       || null,
      size:        item.size        || null,
      dimension:   item.dimension   || null,
      weight:      item.weight      || null,
      category:    item.category    || null,
      upc:         item.upc || item.ean || null,
      images:      item.images      || [],
      offers,
      // UPCItemDB historical price range (can supplement live offers)
      lowestRecorded:  item.lowest_recorded_price  ?? null,
      highestRecorded: item.highest_recorded_price ?? null,
    };
  });

  const allImages = [...new Set(items.flatMap((i) => i.images))];
  const allOffers = items.flatMap((i) => i.offers);

  return { title: items[0].title, images: allImages, offers: allOffers, items };
}
