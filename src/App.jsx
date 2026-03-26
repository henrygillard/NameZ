import {
  ApolloClient,
  ApolloProvider,
  HttpLink,
  InMemoryCache,
} from "@apollo/client";
import {
  Provider as AppBridgeProvider,
  useAppBridge,
} from "@shopify/app-bridge-react";
import { authenticatedFetch } from "@shopify/app-bridge-utils";
import { Redirect } from "@shopify/app-bridge/actions";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en";
import SubscriptionPage from "./pages/SubscriptionPage";
import "@shopify/polaris/build/esm/styles.css";
import { Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

import { HomePage } from "./components/HomePage";

export default function App() {
  const [storeInfo, setStoreInfo] = useState(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  return (
    <PolarisProvider i18n={translations}>
      <AppBridgeProvider
        config={{
          apiKey: process.env.SHOPIFY_API_KEY,
          host: new URL(location).searchParams.get("host"),
          forceRedirect: true,
          shopOrigin: new URL(location).searchParams.get("shop"),
        }}
      >
        <MyProvider setStoreInfo={setStoreInfo}>
          <Routes>
            {storeInfo && (
              <Route
                path="/"
                element={
                  storeInfo?.isSubscribed ? (
                    <HomePage
                      storeInfo={storeInfo}
                      setStoreInfo={setStoreInfo}
                    />
                  ) : (
                    <SubscriptionPage />
                  )
                }
              />
            )}

            <Route
              path="/subscribed"
              element={
                <HomePage
                  storeInfo={storeInfo}
                  setStoreInfo={setStoreInfo}
                  setSubscriptionInfo={setSubscriptionInfo}
                  subscriptionInfo={subscriptionInfo}
                />
              }
            />
          </Routes>
        </MyProvider>
      </AppBridgeProvider>
    </PolarisProvider>
  );
}

function MyProvider({ children, setStoreInfo }) {
  const app = useAppBridge();

  useEffect(() => {
    const findStore = async () => {
      const shop = new URL(window.location.href).searchParams.get("shop");
      const fetchFunc = authenticatedFetch(app);
      const response = await fetchFunc(
        `/findStore?shop=${encodeURIComponent(shop)}`
      );
      const data = await response.json();
      setStoreInfo(data);
    };
    findStore();
  }, []);

  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      credentials: "include",
      fetch: userLoggedInFetch(app),
    }),
  });

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

export function userLoggedInFetch(app) {
  const fetchFunction = authenticatedFetch(app);

  return async (uri, options) => {
    const response = await fetchFunction(uri, options);

    if (
      response.headers.get("X-Shopify-API-Request-Failure-Reauthorize") === "1"
    ) {
      const authUrlHeader = response.headers.get(
        "X-Shopify-API-Request-Failure-Reauthorize-Url"
      );

      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.APP, authUrlHeader || `/auth`);
      return null;
    }
    return response;
  };
}
