/* Resource hints scoped to the marketing route group — these origins
   are only used on the landing page, not in the (app) shell. Next 16
   hoists <link> tags to <head> automatically. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://images.unsplash.com" />
      <link rel="dns-prefetch" href="https://media.istockphoto.com" />
      {children}
    </>
  );
}
