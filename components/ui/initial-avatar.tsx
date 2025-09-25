import { cn } from "@/lib/utils";

interface InitialAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function InitialAvatar({ name, size = 'md', className }: InitialAvatarProps) {
  // nameが空文字列、null、undefinedの場合の安全な処理
  const safeName = name || '';
  const initials = safeName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg'
  };

  return (
    <div
      className={cn(
        'rounded-full bg-custom-dark-gray text-white flex items-center justify-center font-medium',
        sizeClasses[size],
        className
      )}
    >
      {initials}
    </div>
  );
}