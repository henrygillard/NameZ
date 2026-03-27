export function ProductCard({ item, selected, onSelect }) {
  const price = item.offers?.[0]?.price;
  const priceLabel = price != null ? `$${price}` : null;

  return (
    <div
      className={`product-card${selected ? " product-card--selected" : ""}`}
      onClick={onSelect}
    >
      <div className="product-card__image-wrap">
        {item.images?.[0] ? (
          <img
            src={item.images[0]}
            alt={item.title}
            className="product-card__image"
          />
        ) : (
          <div className="product-card__image-placeholder">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
      <div className="product-card__body">
        <p className="product-card__title">{item.title}</p>
        {priceLabel && <p className="product-card__price">{priceLabel}</p>}
      </div>
      {selected && (
        <div className="product-card__check">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </div>
  );
}
