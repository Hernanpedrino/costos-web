import { Navbar } from "@/components/navbar/Navbar";

export const metadata = {
 title: 'El chilo SRL',
 description: 'SEO Title',
};
export default function MainLayout({
 children
}: {
 children: React.ReactNode;
}) {
  return (
    <main className="flex flex-col">
      <Navbar/>
      {children}
    </main>
  );
}