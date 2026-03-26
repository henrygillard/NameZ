import { useState, useEffect, forwardRef } from "react";

export const ProductPreview = forwardRef(function ProductPreview(
  { media, setMedia },
  ref
) {
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [selectedTab, setSelectedTab] = useState(null);

  // Reset tab when a new search result comes in
  useEffect(() => {
    setSelectedTab(null);
    setSelectedItemIndex(0);
  }, [media.Title]);

  const ebayOffers = (media.Offers ?? []).filter((o) => o.source === "ebay");
  const miscOffers = (media.Offers ?? []).filter((o) => o.source !== "ebay");
  const hasEbay = ebayOffers.length > 0;
  const hasMisc = miscOffers.length > 0;

  // Default to misc if available, otherwise ebay
  const activeTab = selectedTab ?? (hasMisc ? "misc" : "ebay");
  const visibleOffers = activeTab === "ebay" ? ebayOffers : miscOffers;

  const handleItemSelect = (index) => {
    setSelectedItemIndex(index);
    const item = media.Items[index];
    setMedia({
      ...media,
      Title: item.title,
      Description: item.description,
      Image: item.images?.[0] ?? null,
      Images: item.images ?? [],
      Brand: item.brand,
      Model: item.model,
      Color: item.color,
      Size: item.size,
      Category: item.category,
      Offers: item.offers ?? [],
      Price: "",
    });
  };

  return (
    <div ref={ref} className="panel-card" style={{ padding: "1.5rem" }}>
      {/* Item selector — only when multiple items */}
      {media.Items?.length > 1 && (
        <div style={{ marginBottom: "1rem" }}>
          <label
            style={{
              fontSize: "0.875rem",
              fontWeight: "500",
              display: "block",
              marginBottom: "0.25rem",
            }}
          >
            Select Item
          </label>
          <select
            style={{
              width: "100%",
              height: "2rem",
              border: "1px solid #ccc",
              padding: "0.25rem",
              fontSize: "1rem",
              borderRadius: "4px",
            }}
            value={selectedItemIndex}
            onChange={(e) => handleItemSelect(Number(e.target.value))}
          >
            {media.Items.map((item, i) => (
              <option key={i} value={i}>
                {item.title || `Item ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Product image */}
      {media.Image && (
        <img
          src={media.Image}
          alt={media.Title}
          style={{
            maxWidth: "100%",
            maxHeight: "280px",
            objectFit: "contain",
            borderRadius: "4px",
            marginBottom: "0.75rem",
            display: "block",
          }}
        />
      )}

      {/* Image carousel — only when multiple images */}
      {media.Images?.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            overflowX: "auto",
            paddingBottom: "0.25rem",
            marginBottom: "1rem",
          }}
        >
          {media.Images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Option ${i + 1}`}
              onClick={() => setMedia({ ...media, Image: url })}
              style={{
                width: 72,
                height: 72,
                objectFit: "cover",
                borderRadius: 6,
                flexShrink: 0,
                cursor: "pointer",
                border:
                  media.Image === url
                    ? "3px solid #2c6ecb"
                    : "3px solid transparent",
                boxSizing: "border-box",
                opacity: media.Image === url ? 1 : 0.6,
                transition: "opacity 0.15s, border-color 0.15s",
              }}
            />
          ))}
        </div>
      )}

      {/* Title */}
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: "600",
          marginBottom: "0.5rem",
          color: "#202223",
        }}
      >
        {media.Title}
      </h2>

      {/* Description */}
      {media.Description && (
        <p
          style={{
            fontSize: "0.9rem",
            color: "#6d7175",
            lineHeight: "1.5",
            marginBottom: "1rem",
          }}
        >
          {media.Description}
        </p>
      )}

      {/* Offers section with tabs */}
      {(hasMisc || hasEbay) && (
        <div>
          <label
            style={{
              fontSize: "1rem",
              fontWeight: "bold",
              display: "block",
              marginBottom: "0.5rem",
            }}
          >
            Offers
          </label>

          {/* Tabs — only show if there are multiple source types */}
          {hasMisc && hasEbay && (
            <div
              style={{
                display: "flex",
                borderBottom: "2px solid #e1e3e5",
                marginBottom: "0.75rem",
              }}
            >
              {hasMisc && (
                <button
                  onClick={() => setSelectedTab("misc")}
                  style={{
                    padding: "0.4rem 0.9rem",
                    fontSize: "0.875rem",
                    fontWeight: activeTab === "misc" ? "600" : "400",
                    color: activeTab === "misc" ? "#2c6ecb" : "#6d7175",
                    background: "none",
                    border: "none",
                    borderBottom:
                      activeTab === "misc"
                        ? "2px solid #2c6ecb"
                        : "2px solid transparent",
                    marginBottom: "-2px",
                    cursor: "pointer",
                  }}
                >
                  Misc Retailers
                </button>
              )}
              {hasEbay && (
                <button
                  onClick={() => setSelectedTab("ebay")}
                  style={{
                    padding: "0.4rem 0.9rem",
                    fontSize: "0.875rem",
                    fontWeight: activeTab === "ebay" ? "600" : "400",
                    color: activeTab === "ebay" ? "#2c6ecb" : "#6d7175",
                    background: "none",
                    border: "none",
                    borderBottom:
                      activeTab === "ebay"
                        ? "2px solid #2c6ecb"
                        : "2px solid transparent",
                    marginBottom: "-2px",
                    cursor: "pointer",
                  }}
                >
                  eBay Offers
                </button>
              )}
            </div>
          )}

          {/* Offers table */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ccc",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  Merchant
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ccc",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  Price
                </th>
                <th
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid #ccc",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  Link
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleOffers.map((offer, i) => (
                <tr key={i}>
                  <td style={{ padding: "0.25rem 0.5rem" }}>
                    {offer.merchant || "—"}
                  </td>
                  <td style={{ padding: "0.25rem 0.5rem" }}>
                    {offer.price != null ? `$${offer.price}` : "—"}
                  </td>
                  <td style={{ padding: "0.25rem 0.5rem" }}>
                    {offer.link ? (
                      <a
                        href={offer.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#2c6ecb",
                          textDecoration: "underline",
                        }}
                      >
                        View
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
