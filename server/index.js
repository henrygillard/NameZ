// @ts-check
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import getRawBody from "raw-body";
import crypto from "crypto";
import { Shopify, ApiVersion } from "@shopify/shopify-api";
import "dotenv/config";
import applyAuthMiddleware from "./middleware/auth.js";
import verifyRequest from "./middleware/verify-request.js";
import {
  addNewStore,
  findStore,
  findStoreByName,
  updateStore,
  updateStoreSubscription,
  cancelStoreSubscription,
  activateStoreSubscription,
  deleteStoreInfo,
  deleteSessionsByShop,
  mongoSessionStorage,
  incrementSearchCounts,
  incrementSearchFailCount,
  logFailedSearch,
  getFailedSearches,
  incrementProductCount,
  backfillEmail,
  getStats,
  getNotSubscribedStores,
  getSubscribedStores,
} from "./mongo/index.js";
import { sendAlert } from "./alerting.js";
import { lookupByKeyword } from "./ebay.js";
import { lookupByName as upcLookup } from "./upcitemdb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USE_ONLINE_TOKENS = false;
const TOP_LEVEL_OAUTH_COOKIE = "shopify_top_level_oauth";

const PORT = parseInt(process.env.PORT || "8081", 10);
const isTest = process.env.NODE_ENV === "test" || !!process.env.VITE_TEST_BUILD;

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES ? process.env.SCOPES.split(",") : "write_products",
  HOST_NAME: process.env.HOST.replace(/https:\/\//, ""),
  API_VERSION: ApiVersion.April22,
  IS_EMBEDDED_APP: true,
  SESSION_STORAGE: new Shopify.Session.CustomSessionStorage(
    mongoSessionStorage.storeCallback,
    mongoSessionStorage.loadCallback,
    mongoSessionStorage.deleteCallback
  ),
});
console.log("[startup] HOST_NAME set to:", Shopify.Context.HOST_NAME);
console.log("[startup] API_KEY present:", !!Shopify.Context.API_KEY);

const ACTIVE_SHOPIFY_SHOPS = {};
Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/webhooks",
  webhookHandler: async (topic, shop, body) => {
    await deleteStoreInfo(shop);
    delete ACTIVE_SHOPIFY_SHOPS[shop];
  },
});

Shopify.Webhooks.Registry.addHandler("APP_SUBSCRIPTIONS_UPDATE", {
  path: "/webhooks",
  webhookHandler: async (topic, shop, body) => {
    const payload = JSON.parse(body);
    console.log(
      `[APP_SUBSCRIPTIONS_UPDATE] shop=${shop} status=${payload.status}`
    );
    if (payload.status === "ACTIVE") {
      await activateStoreSubscription(shop, {
        currentPeriodEnd: payload.current_period_end,
        trialDays: payload.trial_days,
      });
    } else if (
      payload.status === "DECLINED" ||
      payload.status === "CANCELLED"
    ) {
      await cancelStoreSubscription(shop, payload.status);
    }
  },
});

// export for test use only
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production"
) {
  const app = express();
  app.set("top-level-oauth-cookie", TOP_LEVEL_OAUTH_COOKIE);
  app.set("active-shopify-shops", ACTIVE_SHOPIFY_SHOPS);
  app.set("use-online-tokens", USE_ONLINE_TOKENS);

  app.use(cookieParser(Shopify.Context.API_SECRET_KEY));

  applyAuthMiddleware(app);

  app.post("/webhooks", async (req, res) => {
    try {
      await Shopify.Webhooks.Registry.process(req, res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (error) {
      console.log(`Failed to process webhook: ${error}`);
      if (!res.headersSent) {
        res.status(500).send(error.message);
      }
    }
  });

  app.get("/products-count", verifyRequest(app), async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(req, res, true);
    const { Product } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );

    const countData = await Product.count({ session });
    res.status(200).send(countData);
  });

  app.post("/graphql", verifyRequest(app), async (req, res) => {
    try {
      console.log("[graphql] proxying request, shop:", req.query.shop);
      const session = await Shopify.Utils.loadCurrentSession(req, res, false);
      if (!session) {
        console.error("[graphql] no offline session found");
        return res.status(500).send("No session found");
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          let bodyObj;
          try {
            bodyObj = JSON.parse(body);
          } catch (e) {}
          const client = new Shopify.Clients.Graphql(
            session.shop,
            session.accessToken
          );
          const response = await client.query({ data: bodyObj || body });
          console.log("[graphql] proxy success");
          res.status(200).send(response.body);
        } catch (error) {
          console.error("[graphql] client error:", error.message);
          res.status(500).send(error.message);
        }
      });
    } catch (error) {
      console.error("[graphql] proxy error:", error.message);
      res.status(500).send(error.message);
    }
  });

  // Helper: verify Shopify GDPR webhook HMAC from header over raw body
  async function verifyGdprHmac(req) {
    const shopifyHmac = req.headers["x-shopify-hmac-sha256"];
    if (!shopifyHmac) return { valid: false, rawBody: null };

    const rawBody = await getRawBody(req, { encoding: "utf-8" });

    const calculatedHmac = crypto
      .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
      .update(rawBody, "utf8")
      .digest("base64");

    let valid;
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(calculatedHmac, "base64"),
        Buffer.from(shopifyHmac, "base64")
      );
    } catch {
      valid = false;
    }

    return { valid, rawBody };
  }

  // GDPR WEBHOOK ENDPOINTS — must remain before app.use(express.json())
  app.post("/customers/data_request", async (req, res) => {
    const { valid, rawBody } = await verifyGdprHmac(req);
    if (!valid) return res.status(401).send();

    const body = JSON.parse(rawBody);
    const shop = body.shop_domain;

    const store = await findStoreByName({ shop });
    if (store) {
      const storeObj = store.toObject ? store.toObject() : { ...store };
      const { accessToken, ...safeStore } = storeObj;
      res.json({ shop: safeStore });
    } else {
      res.json({ shop: null });
    }
  });

  app.post("/customers/redact", async (req, res) => {
    const { valid, rawBody } = await verifyGdprHmac(req);
    if (!valid) return res.status(401).send();
    res.json({ message: "No customer data stored by this app" });
  });

  app.post("/shop/redact", async (req, res) => {
    const { valid, rawBody } = await verifyGdprHmac(req);
    if (!valid) return res.status(401).send();

    const body = JSON.parse(rawBody);
    const shop = body.shop_domain;

    await deleteStoreInfo(shop);
    await deleteSessionsByShop(shop);
    res.sendStatus(200);
  });

  app.use(express.json());

  app.use((req, res, next) => {
    const shop = req.query.shop;
    if (Shopify.Context.IS_EMBEDDED_APP && shop) {
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors https://${shop} https://admin.shopify.com;`
      );
    } else {
      res.setHeader("Content-Security-Policy", `frame-ancestors 'none';`);
    }
    next();
  });

  // Name-based product search endpoint
  app.get("/search", verifyRequest(app), async (req, res) => {
    // Step 1: Load offline session to get shop domain
    const session = await Shopify.Utils.loadCurrentSession(req, res, false);
    if (!session) {
      return res.status(401).json({ error: "No session found" });
    }

    // Step 2: Enforce subscription server-side
    const store = await findStoreByName({ shop: session.shop });
    if (!store || !store.isSubscribed) {
      return res.status(402).json({ subscriptionRequired: true });
    }

    const name = req.query.name?.trim();
    if (!name) {
      return res.json({ error: "Please enter a product name to search." });
    }

    try {
      // Step 1: UPCItemDB first (richer product metadata)
      const upcResult = await upcLookup(name).catch((e) => {
        console.warn("[upcitemdb] lookup failed:", e.message);
        return null;
      });

      // Step 2: Fall back to eBay if UPC returned nothing or very few results
      const UPC_THRESHOLD = 3;
      const needsEbay = !upcResult || upcResult.items.length < UPC_THRESHOLD;
      const ebayResult = needsEbay
        ? await lookupByKeyword(name).catch((e) => {
            console.warn("[ebay] keyword lookup failed:", e.message);
            return null;
          })
        : null;

      // Step 3: Bail if both sources returned nothing
      if (!upcResult && !ebayResult) {
        incrementSearchFailCount(session.shop).catch((e) =>
          console.error("[searchFailCount] increment failed:", e.message)
        );
        logFailedSearch(session.shop, name).catch((e) =>
          console.error("[failedSearch] log failed:", e.message)
        );
        return res.json({ error: "Sorry! No results found for that search." });
      }

      // Step 4: Merge items — UPC first, eBay appended as fallback items
      const upcItems   = upcResult?.items  ?? [];
      const ebayItems  = ebayResult?.items ?? [];
      const allItems   = [...upcItems, ...ebayItems];

      // Step 5: Merge all offers — UPC merchants + eBay listings
      const upcOffers  = upcResult?.offers  ?? [];
      const ebayOffers = ebayResult?.offers ?? [];
      const allOffers  = [...upcOffers, ...ebayOffers];

      // Step 6: Deduplicate images
      const allImages = [
        ...new Set([
          ...(upcResult?.images  ?? []),
          ...(ebayResult?.images ?? []),
        ]),
      ];

      // Step 7: Calculate price range from all live offer prices
      //         plus UPCItemDB's historical recorded prices
      const livePrices = allOffers
        .map((o) => o.price)
        .filter((p) => p > 0);

      // Pull in UPCItemDB historical extremes when available
      const recordedLows  = upcItems.map((i) => i.lowestRecorded).filter((v) => v != null);
      const recordedHighs = upcItems.map((i) => i.highestRecorded).filter((v) => v != null);
      const allLowCandidates  = [...livePrices, ...recordedLows];
      const allHighCandidates = [...livePrices, ...recordedHighs];

      const lowestPrice  = allLowCandidates.length  > 0 ? Math.min(...allLowCandidates)  : null;
      const highestPrice = allHighCandidates.length > 0 ? Math.max(...allHighCandidates) : null;
      const averagePrice =
        lowestPrice != null && highestPrice != null
          ? Math.round(((lowestPrice + highestPrice) / 2) * 100) / 100
          : null;

      // Step 8: Use UPC metadata when available, fall back to eBay title/images
      const primaryItem = upcItems[0] ?? null;
      const primaryResult = upcResult ?? ebayResult;

      const media = {
        Title:       primaryResult.title,
        Image:       allImages[0] ?? null,
        Description: primaryItem?.description ?? null,
        Brand:       primaryItem?.brand       ?? null,
        Model:       primaryItem?.model       ?? null,
        Color:       primaryItem?.color       ?? null,
        Size:        primaryItem?.size        ?? null,
        Category:    primaryItem?.category    ?? null,
        Dimension:   primaryItem?.dimension   ?? null,
        Weight:      primaryItem?.weight      ?? null,
        LowestPrice:  lowestPrice,
        HighestPrice: highestPrice,
        AveragePrice: averagePrice,
        Images:  allImages,
        Offers:  allOffers,
        Price:   req.query.defaults,
        Items:   allItems,
      };

      res.send(media);
      // Fire-and-forget: increment search counters
      incrementSearchCounts(session.shop).catch((e) =>
        console.error("[searchCount] increment failed:", e.message)
      );
    } catch (e) {
      sendAlert(
        "search-api-failure",
        `Name search failed for "${name}": ${e.message}`
      ).catch(() => {});
      res.send({ error: "Sorry! Something went wrong with your search." });
    }
  });

  app.get("/admin/stats", async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      res.json(await getStats());
    } catch (e) {
      console.error("[admin/stats] error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/admin/failed-searches", async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 500);
      const offset = parseInt(req.query.offset) || 0;
      res.json(await getFailedSearches({ limit, offset }));
    } catch (e) {
      console.error("[admin/failed-searches] error:", e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/admin/stores/subscribed", async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(await getSubscribedStores());
  });

  app.get("/admin/stores/not-subscribed", async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json(await getNotSubscribedStores());
  });

  app.post("/product-created", verifyRequest(app), async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(req, res, false);
    if (!session?.shop) return res.status(401).json({ error: "Unauthorized" });
    incrementProductCount(session.shop).catch((e) =>
      console.error("[productCount] increment failed:", e.message)
    );
    res.json({ ok: true });
  });

  app.get("/findStore", verifyRequest(app), async (req, res) => {
    const store = await findStoreByName(req.query);
    res.send(store);
  });

  app.put("/updateStore", verifyRequest(app), async (req, res) => {
    const store = await updateStore(req.body.data);
    res.send(store);
  });

  app.put("/updateStoreSubscription", verifyRequest(app), async (req, res) => {
    return res.status(410).json({
      error:
        "Deprecated: subscription state is managed server-side via billing callback and webhooks",
    });
  });

  app.get("/billing/callback", async (req, res) => {
    const { shop, host, charge_id } = req.query;

    if (!shop || !charge_id) {
      return res.status(400).send("Missing required parameters");
    }

    const appUrl = `${process.env.HOST}/?shop=${encodeURIComponent(
      shop
    )}&host=${encodeURIComponent(host || "")}`;

    try {
      const session = await Shopify.Utils.loadOfflineSession(String(shop));
      if (!session) {
        console.error("[billing/callback] no session for shop:", shop);
        return res.redirect(appUrl);
      }

      const client = new Shopify.Clients.Graphql(
        session.shop,
        session.accessToken
      );
      const gid = `gid://shopify/AppSubscription/${charge_id}`;
      const response = await client.query({
        data: {
          query: `query GetSubscription($id: ID!) {
            node(id: $id) {
              ... on AppSubscription {
                id
                status
                trialDays
                currentPeriodEnd
                createdAt
                lineItems { id }
              }
            }
          }`,
          variables: { id: gid },
        },
      });

      const subscription = response.body?.data?.node;
      console.log(
        "[billing/callback] subscription status:",
        subscription?.status
      );

      if (subscription?.status === "ACTIVE") {
        const store = await findStoreByName({ shop });
        if (store) {
          await updateStoreSubscription({
            _id: store._id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            trialDays: subscription.trialDays,
            subscriptionCreatedAt: subscription.createdAt,
            object: {
              appSubscriptionCreate: {
                appSubscription: {
                  id: subscription.id,
                  lineItems: subscription.lineItems,
                },
              },
            },
          });
          console.log("[billing/callback] subscription activated for:", shop);
        }
      }
    } catch (error) {
      console.error("[billing/callback] error:", error.message);
    }

    res.redirect(appUrl);
  });

  app.get("/admin-dashboard", (req, res) => {
    res.sendFile(join(__dirname, "admin-dashboard.html"));
  });

  app.use("/*", (req, res, next) => {
    const { shop } = req.query;

    if (app.get("active-shopify-shops")[shop] === undefined && shop) {
      res.redirect(`/auth?${new URLSearchParams(req.query).toString()}`);
    } else {
      next();
    }
  });

  app.get("/privacy-policy", (req, res) => {
    res.sendFile(join(__dirname, "privacy-policy.html"));
  });

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite;
  if (!isProd) {
    vite = await import("vite").then(({ createServer }) =>
      createServer({
        root,
        logLevel: isTest ? "error" : "info",
        server: {
          port: PORT,
          hmr: {
            protocol: "ws",
            host: "localhost",
            port: 64999,
            clientPort: 64999,
          },
          middlewareMode: "html",
        },
      })
    );
    app.use(vite.middlewares);
  } else {
    const compression = await import("compression").then(
      ({ default: fn }) => fn
    );
    const serveStatic = await import("serve-static").then(
      ({ default: fn }) => fn
    );
    const fs = await import("fs");
    app.use(compression());
    app.use(serveStatic(resolve("dist/client")));
    app.use("/*", (req, res, next) => {
      res
        .status(200)
        .set("Content-Type", "text/html")
        .send(fs.readFileSync(`${process.cwd()}/dist/client/index.html`));
    });
  }

  // Global error handler
  app.use(async (err, req, res, next) => {
    console.error("[express] unhandled error:", err.message);
    sendAlert(
      "app-crash",
      `Express error on ${req.method} ${req.path}: ${err.message}`
    ).catch(() => {});
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  });

  return { app, vite };
}

if (!isTest) {
  createServer().then(({ app }) => app.listen(PORT));

  process.on("uncaughtException", (err) => {
    console.error("[process] uncaughtException:", err.message);
    sendAlert(
      "app-crash",
      `uncaughtException: ${err.message}\n${err.stack}`
    ).catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error("[process] unhandledRejection:", message);
    sendAlert("app-crash", `unhandledRejection: ${message}`).catch(() => {});
  });
}
