// types/react-resizable-panels.d.ts
import 'react-resizable-panels';

declare module 'react-resizable-panels' {
      interface PanelProps {
        /** 初期パネルサイズ(%) */
        defaultSize?: number;
        /** 最小パネルサイズ(%) */
        minSize?: number;
     }
}
