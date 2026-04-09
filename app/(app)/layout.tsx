import AppProgressBar from "@/components/layout/AppProgressBar";
import AppSidebar from "@/components/layout/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppSidebar />
      <AppProgressBar />
      <div className="pl-0 md:pl-14 pt-9">{children}</div>
    </>
  );
}
