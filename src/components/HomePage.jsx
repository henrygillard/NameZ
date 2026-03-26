import { Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";
import { useState, useEffect, useRef } from "react";
import { ProductPreview } from "./ProductPreview";
import { ProductForm } from "./ProductForm";

export function HomePage({
  storeInfo,
  setStoreInfo,
  setSubscriptionInfo,
  subscriptionInfo,
}) {
  const app = useAppBridge();
  const [media, setMedia] = useState(null);
  const [query, setQuery] = useState("");
  const previewRef = useRef(null);

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

  const pathName = window.location.pathname;
  useEffect(() => {
    if (pathName === "/subscribed") {
      updateStore();
    }
  }, []);

  const handleReset = () => {
    setQuery("");
    setMedia(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Core search logic
  const searchByName = async (nameValue) => {
    setMedia("");
    if (!nameValue.trim()) {
      alert("Please enter a product name to search.");
      return;
    }
    const fetchFunc = authenticatedFetch(app);
    const response = await fetchFunc(
      `/search?name=${encodeURIComponent(nameValue.trim())}`
    );
    const data = await response.json();
    if (data.error) {
      alert(data.error);
      setMedia(null);
    } else {
      setMedia(data);
      // Auto-scroll to results on mobile
      setTimeout(() => {
        previewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    searchByName(query);
  };

  return (
    <div className="dashboard-layout">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar-left">
        <div className="sidebar-header-container">
          <div className="sidebar-header">Name-Z</div>
        </div>
        <input
          className="sidebar-input"
          placeholder="Search by item name"
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
      </aside>

      {/* CONTENT AREA: center + right columns */}
      <div className="content-area">
        {/* CENTER COLUMN */}
        <div className="center-column">
          {!media ? (
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
          ) : media === "" ? (
            <div className="placeholder-card">
              <p>Searching...</p>
            </div>
          ) : (
            <ProductPreview
              ref={previewRef}
              media={media}
              setMedia={setMedia}
            />
          )}
        </div>

        {/* RIGHT COLUMN — only renders after search */}
        {media && media !== "" && (
          <div className="right-column">
            <ProductForm
              media={media}
              setMedia={setMedia}
              onReset={handleReset}
            />
          </div>
        )}
      </div>
    </div>
  );
}
