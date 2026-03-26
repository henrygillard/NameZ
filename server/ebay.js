// @ts-check
import axios from "axios";

const EBAY_API_BASE = "https://api.ebay.com";
const EBAY_MARKETPLACE_ID = "EBAY_US";

// In-memory token cache — survives for the lifetime of the server process
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
  // Return cached token if still valid (60s buffer before expiry)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );
  const { data } = await axios.post(
    `${EBAY_API_BASE}/identity/v1/oauth2/token`,
    "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Search for products by keyword using the eBay Browse API.
 * Returns { title, images, offers, items } or null if not found / credentials missing.
 */
export async function lookupByKeyword(query) {
  const token = await getAppToken();
  if (!token) return null;

  const { data } = await axios.get(
    `${EBAY_API_BASE}/buy/browse/v1/item_summary/search`,
    {
      params: { q: query, limit: 10 },
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
      },
    }
  );

  if (!data.itemSummaries?.length) return null;

  // Build per-item data for multi-item selection in the UI
  const items = data.itemSummaries.map((item) => {
    const images = [];
    if (item.image?.imageUrl) images.push(item.image.imageUrl);
    for (const img of item.additionalImages ?? []) {
      if (img.imageUrl) images.push(img.imageUrl);
    }
    const priceValue =
      item.price?.value ??
      item.currentBidPrice?.value ??
      item.priceRange?.minimumPrice?.value;
    const offers = [];
    if (priceValue) {
      offers.push({
        merchant: item.seller?.username ?? "eBay",
        price: parseFloat(priceValue),
        link: item.itemWebUrl,
        source: "ebay",
      });
    }
    return {
      title: item.title,
      images,
      offers,
      description: null,
      brand: null,
      model: null,
      color: null,
      size: null,
      category: null,
      upc: null,
    };
  });

  // Aggregate all images and offers for the top-level response
  const allImages = [...new Set(items.flatMap((i) => i.images))];
  const allOffers = items.flatMap((i) => i.offers);

  return {
    title: items[0].title,
    images: allImages,
    offers: allOffers,
    items,
  };
}
