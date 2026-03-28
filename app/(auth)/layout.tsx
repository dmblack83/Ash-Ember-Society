import { Logo } from "@/components/ui/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Brand mark — always present, centered above the auth card */}
        <div className="flex justify-center mb-10">
          <Logo variant="full" size="lg" />
        </div>
        {children}
      </div>
    </div>
  );
}
