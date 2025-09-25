import { Button } from '@/components/ui/button';

interface Tab {
  id: string;
  title: string;
  subtitle?: string;
}

interface SubThemeTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function SubThemeTabs({ tabs, activeTab, onTabChange }: SubThemeTabsProps) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex">
        {tabs.map((tab, index) => (
        <Button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
              px-4 py-3 text-sm font-medium transition-all duration-200 h-auto min-h-[60px] flex flex-col items-start justify-center flex-1 relative bg-gray-100
          ${activeTab === tab.id
              ? 'bg-gray-200 text-custom-black'
                  : 'bg-white text-gray-600 hover:bg-gray-200 border-b border-gray-300'
              } ${activeTab !== tab.id
              ? 'bg-white text-custom-black hover:bg-gray-100 border-gray-200 rounded-tl-xl'
                  : 'bg-white text-custom-black border-b-2 border-white'
              } ${index === tabs.length - 1 ? 'rounded-tr-xl' : ''}
              ${index > 0 ? 'border-l border-gray-50' : ''}
             : 'bg-gray-200 text-gray-700 hover:text-gray-500 hover:bg-gray-100'
          `}
          variant={activeTab === tab.id ? "default" : "outline"}
        >
          <span className="text-sm font-medium leading-tight">
            {tab.title}
          </span>
          {tab.subtitle && (
            <span className={`text-xs mt-1 leading-tight ${
              activeTab === tab.id ? 'text-gray-200' : 'text-gray-500'
            }`}>
              {tab.subtitle}
            </span>
          )}
        </Button>
        ))}
      </div>
    </div>
  );
}