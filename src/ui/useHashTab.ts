import { useCallback, useEffect, useState } from 'react';

/** The three screens. The current one is kept in the address bar (e.g. "#quality"), so links and Back work. */
export type Tab = 'overview' | 'quality' | 'analytics';

const TABS: readonly Tab[] = ['overview', 'quality', 'analytics'];

/** Reads the screen from a hash like "#quality". Anything unknown opens the Overview. */
export function parseTab(hash: string): Tab {
  const name = hash.replace(/^#/, '');
  return TABS.find((tab) => tab === name) ?? 'overview';
}

/** The current screen, plus a function to switch screens (which updates the address bar). */
export function useHashTab(): [Tab, (tab: Tab) => void] {
  const [tab, setTab] = useState<Tab>(() => parseTab(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setTab(parseTab(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const goTo = useCallback((next: Tab) => {
    window.location.hash = next;
  }, []);

  return [tab, goTo];
}
