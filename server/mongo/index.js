import mongoose from "mongoose";
import { Shopify } from "@shopify/shopify-api";
import axios from "axios";
import { convertDatesToCst } from "../utils.js";

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on("connected", function () {
  console.log(`Connected to ${db.name} at ${db.host}:${db.port}`);
});

const Store = mongoose.Schema({
  _id: String,
  name: String,
  id: String,
  shop: String,
  accessToken: String,
  scope: String,
  isOnline: Boolean,
  state: String,
  isSubscribed: Boolean,
  subscriptionStatus: String,
  currentPeriodEnd: Date,
  trialDays: Number,
  subscriptionCreatedAt: Date,
  appSubscription: {
    id: String,
    lineItems: {
      id: String,
    },
  },
  email: String,
  totalSearchCount: { type: Number, default: 0 },
  totalSearchFailCount: { type: Number, default: 0 },
  monthlySearchCount: { type: Number, default: 0 },
  searchCountResetDate: Date,
  productsCreated: { type: Number, default: 0 },
  lastSuccessfulProductTimestamp: Date,
});

let StoreCollection = mongoose.model("Store", Store);

const ShopifySession = mongoose.Schema({
  _id: String,
  shop: String,
  state: String,
  isOnline: Boolean,
  scope: String,
  expires: Date,
  accessToken: String,
  onlineAccessInfo: Object,
});

let SessionCollection = mongoose.model("ShopifySession", ShopifySession);

const FailedSearch = mongoose.Schema({
  searchQuery: String,
  shop: String,
  createdAt: { type: Date, default: Date.now },
});

let FailedSearchCollection = mongoose.model("FailedSearch", FailedSearch);

export const mongoSessionStorage = {
  storeCallback: async (session) => {
    try {
      console.log(
        "[session] storing session id:",
        session.id,
        "scope:",
        session.scope
      );
      await SessionCollection.findByIdAndUpdate(
        session.id,
        { ...session, _id: session.id },
        { upsert: true }
      );
      console.log("[session] stored successfully");
      return true;
    } catch (e) {
      console.error("[session] storeCallback error:", e.message);
      return false;
    }
  },
  loadCallback: async (id) => {
    try {
      console.log("[session] loading session id:", id);
      const doc = await SessionCollection.findById(id).lean();
      if (!doc) {
        console.log("[session] not found in MongoDB");
        return undefined;
      }
      console.log("[session] found, shop:", doc.shop);
      const session = new Shopify.Session.Session(
        doc._id,
        doc.shop,
        doc.state,
        doc.isOnline
      );
      session.scope = doc.scope || process.env.SCOPES;
      session.expires = doc.expires ? new Date(doc.expires) : undefined;
      session.accessToken = doc.accessToken;
      session.onlineAccessInfo = doc.onlineAccessInfo;
      // Backfill email for merchants who installed before Phase 9 — non-blocking
      if (!doc.email && doc.accessToken) {
        (async () => {
          try {
            const { data } = await axios.get(
              `https://${doc.shop}/admin/api/2022-04/shop.json`,
              { headers: { "X-Shopify-Access-Token": doc.accessToken } }
            );
            const email = data?.shop?.email;
            if (email) {
              await StoreCollection.findOneAndUpdate(
                { shop: doc.shop },
                { email }
              );
              console.log(`[backfillEmail] stored email for ${doc.shop}`);
            }
          } catch (e) {
            console.error(`[backfillEmail] failed for ${doc.shop}:`, e.message);
          }
        })();
      }
      return session;
    } catch (e) {
      console.error("[session] loadCallback error:", e.message);
      return undefined;
    }
  },
  deleteCallback: async (id) => {
    await SessionCollection.deleteOne({ _id: id });
    return true;
  },
};

export let addNewStore = (session) => {
  const newSession = {
    _id: session.id,
    name: session.name,
    isSubscribed: false,
    id: session.id,
    shop: session.shop,
    isOnline: session.isOnline,
    state: session.state,
    scope: session.scope,
    accessToken: session.accessToken,
  };
  return StoreCollection.create(newSession);
};

export let findStore = (id) => {
  return StoreCollection.findById(id);
};

export let findStoreByName = (name) => {
  return StoreCollection.findOne({ shop: name.shop });
};

export let newProduct = (object) => {};

export let updateStore = (object) => {
  return StoreCollection.findByIdAndUpdate(object._id, { isSubscribed: true });
};

export let updateStoreSubscription = (object) => {
  return StoreCollection.findByIdAndUpdate(object._id, {
    isSubscribed: true,
    subscriptionStatus: object.subscriptionStatus ?? "ACTIVE",
    currentPeriodEnd: object.currentPeriodEnd
      ? new Date(object.currentPeriodEnd)
      : undefined,
    trialDays: object.trialDays,
    subscriptionCreatedAt: object.subscriptionCreatedAt
      ? new Date(object.subscriptionCreatedAt)
      : undefined,
    appSubscription: {
      id: object.object.appSubscriptionCreate.appSubscription.id,
      lineItems: {
        id: object.object.appSubscriptionCreate.appSubscription.lineItems[0].id,
      },
    },
  });
};

export let cancelStoreSubscription = (thisShop, status = "CANCELLED") => {
  return StoreCollection.findOneAndUpdate(
    { shop: thisShop },
    { isSubscribed: false, appSubscription: null, subscriptionStatus: status }
  );
};

export let activateStoreSubscription = (thisShop, data = {}) => {
  const update = { isSubscribed: true, subscriptionStatus: "ACTIVE" };
  if (data.currentPeriodEnd)
    update.currentPeriodEnd = new Date(data.currentPeriodEnd);
  if (data.trialDays !== undefined) update.trialDays = data.trialDays;
  return StoreCollection.findOneAndUpdate({ shop: thisShop }, update);
};

export let deleteStoreInfo = (thisShop) => {
  return StoreCollection.deleteOne({ shop: thisShop });
};

export let deleteSessionsByShop = (thisShop) => {
  return SessionCollection.deleteMany({ shop: thisShop });
};

export let incrementSearchCounts = (shop) => {
  return StoreCollection.findOneAndUpdate(
    { shop },
    { $inc: { totalSearchCount: 1, monthlySearchCount: 1 } }
  );
};

export let incrementSearchFailCount = (shop) => {
  return StoreCollection.findOneAndUpdate(
    { shop },
    { $inc: { totalSearchFailCount: 1 } }
  );
};

export let logFailedSearch = (shop, searchQuery) => {
  return FailedSearchCollection.create({ shop, searchQuery });
};

export let getFailedSearches = async ({ limit = 100, offset = 0 } = {}) => {
  const [total, results] = await Promise.all([
    FailedSearchCollection.countDocuments(),
    FailedSearchCollection.find()
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
  ]);
  return { total, results: results.map(convertDatesToCst) };
};

export let incrementProductCount = (shop) => {
  return StoreCollection.findOneAndUpdate(
    { shop },
    {
      $inc: { productsCreated: 1 },
      $set: { lastSuccessfulProductTimestamp: new Date() },
    }
  );
};

export let backfillEmail = async (shop, accessToken) => {
  try {
    const { data } = await axios.get(
      `https://${shop}/admin/api/2022-04/shop.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } }
    );
    const email = data?.shop?.email;
    if (email) {
      await StoreCollection.findOneAndUpdate({ shop }, { email });
      console.log(`[backfillEmail] stored email for ${shop}`);
    }
  } catch (e) {
    console.error(`[backfillEmail] failed for ${shop}:`, e.message);
    // Non-fatal — do not throw; app continues normally
  }
};

export let getSubscribedStores = async () => {
  return {
    count: await StoreCollection.countDocuments({ isSubscribed: true }),
    stores: await StoreCollection.find({ isSubscribed: true }),
  };
};

export let getNotSubscribedStores = async () => {
  return {
    count: await StoreCollection.countDocuments({ isSubscribed: false }),
    stores: await StoreCollection.find({ isSubscribed: false }),
  };
};

export let getStats = async () => {
  const [totalMerchants, emailCount, allMerchants, totals] = await Promise.all([
    StoreCollection.countDocuments(),
    StoreCollection.countDocuments({ email: { $exists: true, $ne: null } }),
    StoreCollection.find(
      {},
      {
        shop: 1,
        totalSearchCount: 1,
        totalSearchFailCount: 1,
        monthlySearchCount: 1,
        email: 1,
        productsCreated: 1,
        lastSuccessfulProductTimestamp: 1,
        isSubscribed: 1,
        subscriptionStatus: 1,
        appSubscription: 1,
        subscriptionCreatedAt: 1,
        currentPeriodEnd: 1,
        trialDays: 1,
      }
    )
      .sort({ totalSearchCount: -1 })
      .lean(),
    StoreCollection.aggregate([
      {
        $group: {
          _id: null,
          totalSearches: { $sum: "$totalSearchCount" },
          totalProductsCreated: { $sum: "$productsCreated" },
        },
      },
    ]),
  ]);

  return {
    totalMerchants,
    totalSearches: totals[0]?.totalSearches ?? 0,
    totalProductsCreated: totals[0]?.totalProductsCreated ?? 0,
    emailCount,
    allMerchants: allMerchants.map((m) => {
      const numSuccessfulSearches = m.totalSearchCount ?? 0;
      const numSearchFail = m.totalSearchFailCount ?? 0;
      const total = numSuccessfulSearches + numSearchFail;
      return {
        ...convertDatesToCst(m),
        numSuccessfulSearches,
        numSearchFail,
        searchSuccessRate:
          total > 0
            ? Math.round((numSuccessfulSearches / total) * 10000) / 100
            : null,
      };
    }),
  };
};
