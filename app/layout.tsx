import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'QuestLine — make progress, earn your next level', description: 'A playful daily planner with XP, streaks, and rewards.', manifest: '/manifest.json' };
export const viewport: Viewport = { themeColor: '#6853ae' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
