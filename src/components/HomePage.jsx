import { Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";
import { useState, useEffect } from "react";
import { ProductCard } from "./ProductCard";
import { ProductForm } from "./ProductForm";

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
        <span className="header-byline">Powered by eBay data</span>
      </header>

      {/* CONTENT AREA */}
      <div className="content-area">
        {/* CENTER COLUMN — results list */}
        <div className="center-column">
          {searching ? (
            <div className="placeholder-card">
              <p>Searching...</p>
            </div>
          ) : items === null ? (
            <div className="placeholder-card">
              <svg
                width="48"
                height="48"
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
        <div className={`right-column${selectedItem ? "" : " right-column--empty"}`}>
          {selectedItem ? (
            <ProductForm
              media={selectedItem}
              setMedia={setSelectedItem}
              onReset={handleReset}
            />
          ) : items && items.length > 0 ? (
            <div className="placeholder-card">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9z" />
                <polyline points="15 3 15 9 21 9" />
              </svg>
              <p>Select a product to edit &amp; import</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
