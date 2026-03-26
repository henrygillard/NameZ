import { Shopify } from "@shopify/shopify-api";

const TEST_GRAPHQL_QUERY = `
{
  shop {
    name
  }
}`;

export default function verifyRequest(app, { returnHeader = true } = {}) {
  return async (req, res, next) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    let shop = req.query.shop;

    if (session && shop && session.shop !== shop) {
      console.log(
        "[verify] shop mismatch, redirecting. session.shop:",
        session.shop,
        "req.shop:",
        shop
      );
      return res.redirect(`/auth?shop=${shop}`);
    }

    console.log(
      "[verify] session found:",
      !!session,
      "isActive:",
      session?.isActive()
    );
    console.log(
      "[verify] scope:",
      session?.scope,
      "hasToken:",
      !!session?.accessToken,
      "expires:",
      session?.expires
    );
    if (session?.isActive()) {
      try {
        // make a request to make sure oauth has succeeded, retry otherwise
        const client = new Shopify.Clients.Graphql(
          session.shop,
          session.accessToken
        );
        await client.query({ data: TEST_GRAPHQL_QUERY });
        return next();
      } catch (e) {
        console.log(
          "[verify] test query failed:",
          e.message,
          e?.response?.code
        );
        if (
          e instanceof Shopify.Errors.HttpResponseError &&
          e.response.code === 401
        ) {
          // We only want to catch 401s here, anything else should bubble up
        } else {
          throw e;
        }
      }
    }

    if (returnHeader) {
      if (!shop) {
        if (session) {
          shop = session.shop;
        } else if (Shopify.Context.IS_EMBEDDED_APP) {
          const authHeader = req.headers.authorization;
          console.log("[verify] authorization header present:", !!authHeader);
          const matches = authHeader?.match(/Bearer (.*)/);
          if (matches) {
            try {
              const payload = Shopify.Utils.decodeSessionToken(matches[1]);
              console.log("[verify] decoded token dest:", payload.dest);
              shop = payload.dest.replace("https://", "");
            } catch (tokenErr) {
              console.error("[verify] token decode failed:", tokenErr.message);
            }
          }
        }
      }

      if (!shop || shop === "") {
        return res
          .status(400)
          .send(
            `Could not find a shop to authenticate with. Make sure you are making your XHR request with App Bridge's authenticatedFetch method.`
          );
      }

      res.status(403);
      res.header("X-Shopify-API-Request-Failure-Reauthorize", "1");
      res.header(
        "X-Shopify-API-Request-Failure-Reauthorize-Url",
        `/auth?shop=${shop}`
      );
      res.end();
    } else {
      res.redirect(`/auth?shop=${shop}`);
    }
  };
}
