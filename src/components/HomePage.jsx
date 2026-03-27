import { Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";
import { useState, useEffect } from "react";
import { ProductCard } from "./ProductCard";
import { ProductForm } from "./ProductForm";

function SkeletonList() {
  return (
    <div className="skeleton-list">
      <div className="skeleton-header" />
      {[80, 65, 90, 55, 70].map((w, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-card__image" />
          <div className="skeleton-card__body">
            <div className="skeleton-line" style={{ height: 10, width: `${w}%`, borderRadius: 5 }} />
            <div className="skeleton-line" style={{ height: 9, width: "38%", borderRadius: 5 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WelcomeEmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>
      <p className="empty-state__title">Import products in seconds</p>
      <p className="empty-state__body">Search for any product, pick the best match, then push it straight to your Shopify store.</p>
      <div className="empty-state__steps">
        <div className="empty-state__step">
          <span className="empty-state__step-num">1</span>
          <span>Type a product name in the search bar above</span>
        </div>
        <div className="empty-state__step">
          <span className="empty-state__step-num">2</span>
          <span>Select the best match from the results list</span>
        </div>
        <div className="empty-state__step">
          <span className="empty-state__step-num">3</span>
          <span>Review the details, set your price, and import</span>
        </div>
      </div>
    </div>
  );
}

function SelectProductEmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z" />
          <polyline points="15 3 15 9 21 9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="12" y2="17" />
        </svg>
      </div>
      <p className="empty-state__title">Select a product to edit fields</p>
      <p className="empty-state__body">Click any result on the left to review its title, description, pricing, and images — then import it to your store.</p>
    </div>
  );
}

export function HomePage({
  storeInfo,
  setStoreInfo,
  setSubscriptionInfo,
  subscriptionInfo,
}) {
  const app = useAppBridge();
  const [items, setItems] = useState(null); // null = no search yet, [] = no results
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [query, setQuery] = useState("");

  const updateStore = async () => {
    const fetchFunc = authenticatedFetch(app);
    const shop = new URL(window.location.href).searchParams.get("shop");
    const findResp = await fetchFunc(
      `/findStore?shop=${encodeURIComponent(shop)}`
    );
    const data = await findResp.json();
    await fetchFunc("/updateStore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    setStoreInfo({ ...data, isSubscribed: true });
  };

  useEffect(() => {
    if (window.location.pathname === "/subscribed") {
      updateStore();
    }
  }, []);

  const searchByName = async (nameValue) => {
    if (!nameValue.trim()) {
      alert("Please enter a product name to search.");
      return;
    }
    setSearching(true);
    setItems(null);
    setSelectedIndex(null);
    setSelectedItem(null);

    const fetchFunc = authenticatedFetch(app);
    const response = await fetchFunc(
      `/search?name=${encodeURIComponent(nameValue.trim())}`
    );
    const data = await response.json();
    setSearching(false);

    if (data.error) {
      alert(data.error);
      setItems([]);
    } else {
      setItems(data.Items ?? []);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    searchByName(query);
  };

  const handleSelect = (index) => {
    const item = items[index];
    setSelectedIndex(index);

    const offers = item.offers ?? [];
    const nonZero = offers.filter((o) => o.price !== 0);
    const src = nonZero.length > 0 ? nonZero : offers;
    const lowest = src.length > 0 ? src.reduce((a, b) => (a.price < b.price ? a : b)).price : 0;
    const highest = offers.length > 0 ? offers.reduce((a, b) => (a.price > b.price ? a : b)).price : 0;

    setSelectedItem({
      Title: item.title ?? "",
      Image: item.images?.[0] ?? null,
      Images: item.images ?? [],
      Description: item.description ?? "",
      Brand: item.brand ?? "",
      Model: item.model ?? "",
      Color: item.color ?? "",
      Size: item.size ?? "",
      Weight: "",
      Category: item.category ?? "",
      Offers: offers,
      LowestPrice: lowest,
      HighestPrice: highest,
      AveragePrice: Math.round(((highest + lowest) / 2) * 100) / 100,
      Price: null,
    });
  };

  const handleReset = () => {
    setQuery("");
    setItems(null);
    setSelectedIndex(null);
    setSelectedItem(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="dashboard-layout">
      {/* TOP HEADER */}
      <header className="app-header">
        <div className="header-brand">Name-Z</div>
        <input
          className="header-input"
          placeholder="Enter item name…"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch(e);
          }}
        />
        <Button onClick={handleSearch} primary>
          Search
        </Button>
      </header>

      {/* CONTENT AREA */}
      <div className="content-area">
        {/* CENTER COLUMN — results list */}
        <div className="center-column">
          {searching ? (
            <SkeletonList />
          ) : items === null ? (
            <div className="placeholder-card">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>Enter a product name to see results</p>
            </div>
          ) : items.length === 0 ? (
            <div className="placeholder-card">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="9" r="6" />
                <line x1="17" y1="17" x2="13.5" y2="13.5" />
                <line x1="6" y1="9" x2="12" y2="9" />
              </svg>
              <p>No results found. Try a different search.</p>
            </div>
          ) : (
            <div className="results-list">
              <p className="results-count">{items.length} result{items.length !== 1 ? "s" : ""}</p>
              {items.map((item, i) => (
                <ProductCard
                  key={i}
                  item={item}
                  selected={selectedIndex === i}
                  onSelect={() => handleSelect(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — edit form for selected product */}
        <div className="right-column">
          {selectedItem ? (
            <ProductForm
              media={selectedItem}
              setMedia={setSelectedItem}
              onReset={handleReset}
            />
          ) : items && items.length > 0 ? (
            <SelectProductEmptyState />
          ) : (
            <WelcomeEmptyState />
          )}
        </div>
      </div>
    </div>
  );
}
