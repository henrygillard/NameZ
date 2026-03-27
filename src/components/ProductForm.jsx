import { useState } from "react";
import { gql, useMutation } from "@apollo/client";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Button } from "@shopify/polaris";
import { userLoggedInFetch } from "../App";

const CREATE_PRODUCT_MUTATION = gql`
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product {
        id
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_VARIANT_MUTATION = gql`
  mutation productVariantsBulkUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_MEDIA_MUTATION = gql`
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        mediaContentType
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function ImageCarousel({ images, selectedImage, onSelect }) {
  const [index, setIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const prev = () => {
    const next = (index - 1 + images.length) % images.length;
    setIndex(next);
    onSelect(images[next]);
  };

  const next = () => {
    const n = (index + 1) % images.length;
    setIndex(n);
    onSelect(images[n]);
  };

  return (
    <div className="carousel">
      <div className="carousel__main">
        <img src={images[index]} alt={`Image ${index + 1}`} className="carousel__img" />
        {images.length > 1 && (
          <>
            <button className="carousel__btn carousel__btn--prev" onClick={prev} type="button">&#8249;</button>
            <button className="carousel__btn carousel__btn--next" onClick={next} type="button">&#8250;</button>
            <span className="carousel__counter">{index + 1} / {images.length}</span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="carousel__thumbs">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Thumbnail ${i + 1}`}
              className={`carousel__thumb${i === index ? " carousel__thumb--active" : ""}`}
              onClick={() => { setIndex(i); onSelect(src); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductForm({ media, setMedia, onReset }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [mutateFunction] = useMutation(CREATE_PRODUCT_MUTATION);
  const [updateVariant] = useMutation(UPDATE_VARIANT_MUTATION);
  const [createMedia] = useMutation(CREATE_MEDIA_MUTATION);

  const app = useAppBridge();
  const fetch = userLoggedInFetch(app);

  const handleChange = (e) => {
    setMedia({ ...media, [e.target.name]: e.target.value });
  };

  const handleMutation = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const result = await mutateFunction({
        variables: {
          input: {
            title: media.Title,
            descriptionHtml: media.Description,
            productType: media.Category,
          },
        },
      });
      const userErrors = result?.data?.productCreate?.userErrors;
      if (userErrors?.length > 0) {
        throw new Error(userErrors.map((e) => e.message).join(", "));
      }
      const productId = result?.data?.productCreate?.product?.id;
      const variantId =
        result?.data?.productCreate?.product?.variants?.edges?.[0]?.node?.id;
      if (variantId && productId) {
        await updateVariant({
          variables: {
            productId,
            variants: [
              {
                id: variantId,
                price: String(media.Price || "0"),
              },
            ],
          },
        });
      }
      if (productId && media.Image) {
        await createMedia({
          variables: {
            productId,
            media: [{ originalSource: media.Image, mediaContentType: "IMAGE" }],
          },
        });
      }
      fetch("/product-created", { method: "POST" }).catch(() => {});
      setLoading(false);
      const numericId = productId?.split("/").pop();
      const shop = new URL(window.location.href).searchParams.get("shop");
      setMessageType("success");
      setMessage(
        <>
          <strong>Product created!</strong>
          {numericId && shop && (
            <>
              {" · "}
              <a
                href={`https://${shop}/admin/products/${numericId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View in admin
              </a>
            </>
          )}
        </>
      );
    } catch (e) {
      console.error("mutation error:", e);
      setLoading(false);
      setMessageType("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  const fmt = (v) => (v != null && v !== 0 ? `$${v}` : null);
  const showPriceBar =
    media.LowestPrice != null || media.HighestPrice != null;

  return (
    <div className="panel-card pf-container">
      <ImageCarousel
        images={media.Images}
        selectedImage={media.Image}
        onSelect={(src) => setMedia({ ...media, Image: src })}
      />

      {showPriceBar && (
        <div className="pf-price-bar">
          <div className="pf-price-stat pf-price-stat--low">
            <span className="pf-price-stat__label">Market Low</span>
            <span className="pf-price-stat__value">{fmt(media.LowestPrice) ?? "—"}</span>
          </div>
          <div className="pf-price-stat pf-price-stat--avg">
            <span className="pf-price-stat__label">Average</span>
            <span className="pf-price-stat__value">{fmt(media.AveragePrice) ?? "—"}</span>
          </div>
          <div className="pf-price-stat pf-price-stat--high">
            <span className="pf-price-stat__label">Market High</span>
            <span className="pf-price-stat__value">{fmt(media.HighestPrice) ?? "—"}</span>
          </div>
        </div>
      )}

      <div className="pf-fields">
        <p className="pf-section-title">Product Details</p>

        <div className="pf-field">
          <label className="pf-label">Title</label>
          <input
            className="pf-input"
            onChange={handleChange}
            name="Title"
            value={media.Title}
          />
        </div>

        <div className="pf-row">
          <div className="pf-field">
            <label className="pf-label">Type</label>
            <input
              className="pf-input"
              onChange={handleChange}
              name="Category"
              value={media.Category ?? ""}
            />
          </div>
          <div className="pf-field">
            <label className="pf-label">Size</label>
            <input
              className="pf-input"
              onChange={handleChange}
              name="Size"
              value={media.Size ?? ""}
            />
          </div>
        </div>

        <div className="pf-row">
          <div className="pf-field">
            <label className="pf-label">Weight</label>
            <input
              className="pf-input"
              onChange={handleChange}
              name="Weight"
              value={media.Weight ?? ""}
            />
          </div>
          <div className="pf-field">
            <label className="pf-label pf-label--required">Price</label>
            <input
              className="pf-input"
              onChange={handleChange}
              required
              name="Price"
              value={
                media.Price ??
                (media.AveragePrice != null ? String(media.AveragePrice) : "")
              }
            />
          </div>
        </div>

        <div className="pf-field">
          <label className="pf-label">Description</label>
          <textarea
            className="pf-textarea"
            name="Description"
            onChange={handleChange}
            value={media.Description ?? ""}
          />
        </div>

        <div className="pf-field">
          <label className="pf-label">Image URL</label>
          <input
            className="pf-input"
            onChange={handleChange}
            name="Image"
            value={media.Image ?? ""}
          />
        </div>
      </div>

      {message && (
        <div className={`pf-message pf-message--${messageType}`}>
          {message}
        </div>
      )}

      <div className="pf-actions">
        <Button primary loading={loading} submit onClick={handleMutation}>
          Add Product to Store
        </Button>
      </div>
    </div>
  );
}
