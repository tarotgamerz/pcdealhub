export const metadata = {
  title: "tarotai — private AI command center",
  description: "Private operator-grade AI command center"
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>){
  return <html lang="en"><body>{children}</body></html>;
}
