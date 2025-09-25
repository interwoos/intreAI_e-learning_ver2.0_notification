'use client';

import { forwardRef } from 'react';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 現在の進捗値 */
  value?: number | null;
  /** 最大値 */
  max?: number;
  /** ラベルをカスタマイズする関数 */
  getValueLabel?: (value: number, max: number) => string;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>((props, ref) => {
  const {
    value: rawValue = 0,
    max: rawMax = 100,
    getValueLabel = (v, m) => `${Math.round((v / m) * 100)}%`,
    className,
    ...rest
  } = props;

  const max = rawMax ?? 100;
  const value = rawValue ?? 0;

  // max のバリデーション
  if ((rawMax || rawMax === 0) && !(typeof rawMax === 'number' && rawMax > 0)) {
    console.error(
      `Invalid prop 'max' of value '${rawMax}' supplied to 'Progress'. ` +
      `Only numbers greater than 0 are valid max values. Defaulting to '100'.`
    );
  }

  // value のバリデーション
  if (value !== null && (typeof value !== 'number' || value < 0 || value > max)) {
    console.error(
      `Invalid prop 'value' of value '${value}' supplied to 'Progress'. ` +
      `The 'value' prop must be a number between 0 and the 'max' prop (${max}).`
    );
  }

  const percentage = (value / max) * 100;

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={className}
      {...rest}
    >
      <div className="h-2 bg-gray-200 rounded">
        <div
          className="h-full bg-blue-600 rounded"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="sr-only">{getValueLabel(value, max)}</span>
    </div>
  );
});

Progress.displayName = 'Progress';
