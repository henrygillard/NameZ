import { Card, Page, EmptyState, Button } from "@shopify/polaris";
import { gql, useMutation } from "@apollo/client";
import { useState } from "react";

const CREATE_SUBSCRIPTION = gql`
  mutation appSubscriptionCreate($url: URL!, $test: Boolean!) {
    appSubscriptionCreate(
      name: "Monthly Subscription"
      trialDays: 3
      returnUrl: $url
      test: $test
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: 5.00, currencyCode: USD }
              interval: EVERY_30_DAYS
            }
          }
        }
      ]
    ) {
      userErrors {
        field
        message
      }

      confirmationUrl
      appSubscription {
        id
        name
        test
        lineItems {
          id
        }
      }
    }
  }
`;

export default function SubscriptionPage() {
  const [createSubMutateFunction] = useMutation(CREATE_SUBSCRIPTION);
  const [loading, setLoading] = useState(false);

  const handleMutation = async () => {
    setLoading(true);
    const params = new URL(window.location.href).searchParams;
    const shop = params.get("shop");
    const host = params.get("host");
    const returnUrl = `${
      window.location.origin
    }/billing/callback?shop=${encodeURIComponent(
      shop
    )}&host=${encodeURIComponent(host)}`;
    const isTest = import.meta.env.VITE_TEST_SUBSCRIPTIONS === "true";
    const mutation = await createSubMutateFunction({
      variables: { url: returnUrl, test: isTest },
    });
    window.top.location = mutation.data.appSubscriptionCreate.confirmationUrl;
  };

  return (
    <Page narrowWidth>
      <Card subdued>
        <EmptyState
          heading="Start your 3-day Free Trial now"
          narrowWidth
          action={{
            content: "Start Free Trial",
            onAction: handleMutation,
            loading: loading,
          }}
        >
          <p>
            Name-Z has a 3-day trial period, afterwards, the app has a
            subscription charge of $5.00 per month.
          </p>
        </EmptyState>
      </Card>
    </Page>
  );
}
