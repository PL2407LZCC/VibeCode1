import { useMemo, useState, type ReactNode } from 'react';
import type {
  ProductPerformanceEntry,
  SalesCategoryMixEntry,
  SalesHighlightDay,
  SalesHourlyBucket,
  SalesStats,
  SalesSummaryMetric
} from '../types';

const SUMMARY_CONFIG: Array<{
  key: keyof SalesStats['summary'];
  label: string;
  format: 'currency' | 'number';
}> = [
  { key: 'revenue', label: 'Revenue (7 days)', format: 'currency' },
  { key: 'transactions', label: 'Transactions', format: 'number' },
  { key: 'itemsSold', label: 'Items sold', format: 'number' },
  { key: 'averageOrderValue', label: 'Avg. order value', format: 'currency' }
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'EUR'
});

const numberFormatter = new Intl.NumberFormat('en-US');

const formatValue = (value: number, format: 'currency' | 'number') =>
  format === 'currency' ? currencyFormatter.format(value) : numberFormatter.format(value);

const formatDelta = (metric: SalesSummaryMetric, format: 'currency' | 'number') => {
  const absolute = formatValue(metric.deltaAbsolute, format);
  if (metric.deltaPercent === null) {
    return `${absolute} Δ`; // No comparison available
  }

  const direction = metric.deltaPercent === 0 ? 'no change' : metric.deltaPercent > 0 ? 'increase' : 'decrease';
  const percent = `${Math.abs(metric.deltaPercent).toFixed(1)}%`;
  return `${absolute} (${direction} ${percent})`;
};

const renderHighlight = (title: string, highlight: SalesHighlightDay | null) => {
  if (!highlight) {
    return (
      <div className="sales-highlight">
        <h4>{title}</h4>
        <p>No recent data.</p>
      </div>
    );
  }

  return (
    <div className="sales-highlight">
      <h4>{title}</h4>
      <p className="sales-highlight__value">{currencyFormatter.format(highlight.total)}</p>
      <p className="sales-highlight__meta">{highlight.transactions} transactions · {highlight.date}</p>
    </div>
  );
};

const renderBarList = (
  items: Array<{ id: string; label: string; value: number; transactions?: number }>,
  maxValue: number
) => {
  if (items.length === 0) {
    return <p className="sales-empty">No data yet.</p>;
  }

  return (
    <ul className="admin-chart" role="list">
      {items.map((item) => {
        const percentage = maxValue === 0 ? 0 : Math.round((item.value / maxValue) * 100);
        return (
          <li key={item.id}>
            <span className="admin-chart__label">{item.label}</span>
            <div className="admin-chart__bar" aria-label={`${item.value.toFixed(2)} value`}>
              <span style={{ width: `${percentage}%` }} />
            </div>
            <span className="admin-chart__value">
              {currencyFormatter.format(item.value)}
              {typeof item.transactions === 'number' ? ` · ${item.transactions} tx` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const renderCategoryMix = (entries: SalesCategoryMixEntry[]) => {
  if (entries.length === 0) {
    return <p className="sales-empty">No category insights yet.</p>;
  }

  return (
    <ol className="sales-category-list">
      {entries.map((entry) => (
        <li key={entry.category}>
          <div>
            <span className="sales-category__label">{entry.category}</span>
            <span className="sales-category__share">{entry.revenueShare}% revenue · {entry.quantityShare}% units</span>
          </div>
          <div className="sales-category__stats">{currencyFormatter.format(entry.revenue)} · {entry.quantity} sold</div>
        </li>
      ))}
    </ol>
  );
};

const renderHourlyTrend = (entries: SalesHourlyBucket[]) => {
  if (entries.length === 0) {
    return <p className="sales-empty">No hourly trend yet.</p>;
  }

  const nonEmpty = entries.filter((entry) => entry.percentage > 0 || entry.transactions > 0);
  const dataset = nonEmpty.length > 0 ? nonEmpty : entries;
  const maxPercentage = dataset.reduce((max, entry) => Math.max(max, entry.percentage), 0);

  const formatPercentageValue = (value: number) => {
    if (!Number.isFinite(value)) {
      return '0';
    }
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  return (
    <ul className="admin-chart" role="list">
      {dataset.map((entry) => {
        const percentValue = Number.isFinite(entry.percentage) ? entry.percentage : 0;
        const width = maxPercentage === 0 ? 0 : Math.round((percentValue / maxPercentage) * 100);
        const percentLabel = formatPercentageValue(percentValue);
        return (
          <li key={entry.hour}>
            <span className="admin-chart__label">{entry.hour}</span>
            <div className="admin-chart__bar" aria-label={`${percentLabel}% of transactions`}>
              <span style={{ width: `${width}%` }} />
            </div>
            <span className="admin-chart__value">{percentLabel}% · {numberFormatter.format(entry.transactions)} tx</span>
          </li>
        );
      })}
    </ul>
  );
};

type SalesOverviewProps = {
  stats: SalesStats | null;
  isLoading: boolean;
};

type CollapsibleKey = 'daily' | 'weekly' | 'hourly' | 'category' | 'products';

const formatPerformanceWindow = (windowValue: ProductPerformanceEntry['sales']['last7Days']) =>
  `${numberFormatter.format(windowValue.quantity)} sold · ${currencyFormatter.format(windowValue.revenue)}`;

export function SalesOverview({ stats, isLoading }: SalesOverviewProps) {
  if (isLoading && !stats) {
    return <p className="sales-empty">Loading analytics…</p>;
  }

  if (!stats) {
    return <p className="sales-empty">No sales recorded yet.</p>;
  }

  const dailyMax = useMemo(() => stats.daily.reduce((max, bucket) => Math.max(max, bucket.total), 0), [stats.daily]);
  const weeklyMax = useMemo(() => stats.weekly.reduce((max, bucket) => Math.max(max, bucket.total), 0), [stats.weekly]);

  const [collapsedSections, setCollapsedSections] = useState<Record<CollapsibleKey, boolean>>({
    daily: true,
    weekly: true,
    hourly: true,
    category: true,
    products: true
  });

  const toggleSection = (key: CollapsibleKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const CollapsiblePanel = ({
    id,
    title,
    description,
    children
  }: {
    id: CollapsibleKey;
    title: string;
    description?: string;
    children: ReactNode;
  }) => {
    const isCollapsed = collapsedSections[id];
    return (
      <div className="sales-panel">
        <button
          type="button"
          className="sales-panel__header"
          onClick={() => toggleSection(id)}
          aria-expanded={!isCollapsed}
          aria-controls={`sales-panel-${id}`}
        >
          <span className={`sales-panel__icon${!isCollapsed ? ' sales-panel__icon--open' : ''}`} aria-hidden="true" />
          <div className="sales-panel__text">
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
        </button>
        {!isCollapsed ? (
          <div id={`sales-panel-${id}`} className="sales-panel__content">
            {children}
          </div>
        ) : null}
      </div>
    );
  };

  const productPerformanceById = useMemo(() => {
    const map = new Map<string, ProductPerformanceEntry>();
    stats.productPerformance.forEach((entry) => {
      map.set(entry.productId, entry);
    });
    return map;
  }, [stats.productPerformance]);

  const productPerformanceContent = stats.productPerformance.length === 0 ? (
    <p className="sales-empty">No product analytics yet.</p>
  ) : (
    <div className="sales-product-table" role="region" aria-live="polite">
      <table>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Inventory</th>
            <th scope="col">Last 7 days</th>
            <th scope="col">Last 30 days</th>
            <th scope="col">Lifetime</th>
          </tr>
        </thead>
        <tbody>
          {stats.productPerformance.map((entry) => (
            <tr key={entry.productId}>
              <th scope="row">
                <span className="sales-product-table__title">{entry.title}</span>
                <span className="sales-product-table__meta">{entry.category} · {entry.isActive ? 'Active' : 'Hidden'}</span>
              </th>
              <td>{numberFormatter.format(entry.inventoryCount)}</td>
              <td>{formatPerformanceWindow(entry.sales.last7Days)}</td>
              <td>{formatPerformanceWindow(entry.sales.last30Days)}</td>
              <td>{formatPerformanceWindow(entry.sales.lifetime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="sales-overview" aria-live="polite">
      <section aria-label="Key performance indicators" className="sales-summary">
        {SUMMARY_CONFIG.map(({ key, label, format }) => {
          const metric = stats.summary[key];
          return (
            <article key={key} className="sales-summary__card">
              <h3>{label}</h3>
              <p className="sales-summary__value">{formatValue(metric.current, format)}</p>
              <p className="sales-summary__delta">{formatDelta(metric, format)}</p>
            </article>
          );
        })}
      </section>

      {stats.alerts.length > 0 ? (
        <section className="sales-alerts" aria-label="Alerts">
          <h3>Alerts</h3>
          <ul>
            {stats.alerts.map((alert, index) => (
              <li key={index}>{alert}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="sales-highlights" aria-label="Highlights">
        {renderHighlight('Best day', stats.highlights.bestDay)}
        {renderHighlight('Slowest day', stats.highlights.slowDay)}
      </section>

      <section className="sales-grid">
        <CollapsiblePanel id="daily" title="Revenue by day">
          {renderBarList(
            stats.daily.map((bucket) => ({
              id: bucket.date,
              label: bucket.date,
              value: bucket.total,
              transactions: bucket.transactions
            })),
            dailyMax
          )}
        </CollapsiblePanel>
        <CollapsiblePanel id="weekly" title="Revenue by week">
          {renderBarList(
            stats.weekly.map((bucket) => ({
              id: bucket.weekStart,
              label: `Week of ${bucket.weekStart}`,
              value: bucket.total,
              transactions: bucket.transactions
            })),
            weeklyMax
          )}
        </CollapsiblePanel>
      </section>

      <section className="sales-grid">
        <CollapsiblePanel id="hourly" title="Hourly trend">
          {renderHourlyTrend(stats.hourlyTrend)}
        </CollapsiblePanel>
        <CollapsiblePanel id="category" title="Category mix">
          {renderCategoryMix(stats.categoryMix)}
        </CollapsiblePanel>
      </section>

      <section className="sales-grid sales-grid--full">
        <CollapsiblePanel
          id="products"
          title="Product performance"
          description="Compare recent sales momentum with current inventory."
        >
          {productPerformanceContent}
        </CollapsiblePanel>
      </section>

      <section aria-label="Top products" className="sales-top-products">
        <h3>Top products (30 days)</h3>
        {stats.topProducts.length === 0 ? (
          <p className="sales-empty">No product sales yet.</p>
        ) : (
          <ol>
            {stats.topProducts.map((product) => {
              const performance = productPerformanceById.get(product.productId);
              const inventoryLabel = performance ? `${performance.inventoryCount} in stock` : null;
              return (
                <li key={product.productId}>
                  <div>
                    <span className="sales-top-products__title">{product.title}</span>
                    <span className="sales-top-products__subtitle">
                      {product.quantity} sold
                      {inventoryLabel ? ` · ${inventoryLabel}` : ''}
                    </span>
                  </div>
                  <span className="sales-top-products__value">{currencyFormatter.format(product.revenue)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
