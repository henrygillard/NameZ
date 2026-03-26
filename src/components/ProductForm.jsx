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

export function ProductForm({ media, setMedia, onReset }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
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
      setMessage(
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "green" }}>Product created successfully!</h1>
          {numericId && shop && (
            <a
              href={`https://${shop}/admin/products/${numericId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#2c6ecb", textDecoration: "underline" }}
            >
              View product
            </a>
          )}
        </div>
      );
    } catch (e) {
      console.error("mutation error:", e);
      setLoading(false);
      setMessage(
        <h1
          style={{
            color: "red",
            textAlign: "center",
          }}
        >
          Sorry, something went wrong. Please try again.
        </h1>
      );
    }
  };

  return (
    <div className="panel-card" style={{ padding: "1.5rem" }}>
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: "600",
          color: "#202223",
          marginBottom: "1rem",
          borderBottom: "1px solid #e1e3e5",
          paddingBottom: "0.75rem",
        }}
      >
        Product Details
      </h3>

      {/* Title */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Title
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          name="Title"
          value={media.Title}
        />
      </div>

      {/* Type */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Type
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          name="Category"
          value={media.Category ?? ""}
        />
      </div>

      {/* Size */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Size
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          name="Size"
          value={media.Size ?? ""}
        />
      </div>

      {/* Weight */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Weight
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          name="Weight"
          value={media.Weight ?? ""}
        />
      </div>

      {/* Price */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Price*
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          required
          name="Price"
          value={
            media.Price ??
            (media.AveragePrice != null ? String(media.AveragePrice) : "")
          }
        />
      </div>

      {/* Description */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Description
        </label>
        <textarea
          name="Description"
          onChange={handleChange}
          value={media.Description ?? ""}
          style={{
            width: "100%",
            height: "8rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            boxSizing: "border-box",
            resize: "vertical",
          }}
        />
      </div>

      {/* Image URL */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          style={{
            fontSize: "0.875rem",
            fontWeight: "500",
            display: "block",
            marginBottom: "0.25rem",
            color: "#202223",
          }}
        >
          Image URL
        </label>
        <input
          style={{
            width: "100%",
            height: "2rem",
            padding: "0 0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "0.9rem",
            boxSizing: "border-box",
          }}
          onChange={handleChange}
          name="Image"
          value={media.Image ?? ""}
        />
      </div>

      {/* Success / error message */}
      {message && <div style={{ marginBottom: "0.75rem" }}>{message}</div>}

      {/* Add Product button */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: "1rem",
        }}
      >
        <Button primary loading={loading} submit onClick={handleMutation}>
          Add Product
        </Button>
      </div>
    </div>
  );
}
