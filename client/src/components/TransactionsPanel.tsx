import { FormEvent, useMemo, useState, useEffect } from 'react';
import { useAdminTransactions, type TransactionFilters } from '../hooks/useAdminTransactions';
import type { AdminTransaction } from '../types';

const currencyFormatter = new Intl.NumberFormat('fi-FI', {
  style: 'currency',
  currency: 'EUR'
});

const timestampFormatter = new Intl.DateTimeFormat('fi-FI', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Helsinki'
});

const dateFormatter = new Intl.DateTimeFormat('fi-FI', {
  dateStyle: 'medium'
});

const numberFormatter = new Intl.NumberFormat('fi-FI');

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const addDaysUtc = (date: Date, amount: number) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
};

const getQuickRange = (days: number) => {
  const today = new Date();
  const start = addDaysUtc(today, -(days - 1));
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(today)
  };
};

type TransactionsPanelProps = {
  onError?: (message: string) => void;
};

export function TransactionsPanel({ onError }: TransactionsPanelProps) {
  const {
    transactions,
    categories,
    range,
    categoryFilter,
    appliedFilters,
    isLoading,
    error,
    fetchTransactions,
    deleteTransaction
  } =
    useAdminTransactions();
  const [formState, setFormState] = useState<TransactionFilters>(appliedFilters);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setFormState(appliedFilters);
  }, [appliedFilters]);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  const activeTransactions = useMemo(
    () => transactions.filter((transaction) => !transaction.isDeleted),
    [transactions]
  );

  const totalRevenue = useMemo(
    () => activeTransactions.reduce((sum, transaction) => sum + transaction.totalAmount, 0),
    [activeTransactions]
  );

  const totalItemsSold = useMemo(
    () =>
      activeTransactions.reduce((sum, transaction) => {
        return sum + transaction.lineItems.reduce((itemSum, item) => itemSum + item.quantity, 0);
      }, 0),
    [activeTransactions]
  );

  const transactionCount = activeTransactions.length;

  const applyFilters = async (filters: TransactionFilters) => {
    await fetchTransactions(filters);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!formState.startDate || !formState.endDate) {
      const message = 'Please provide both a start and end date.';
      setValidationError(message);
      if (onError) {
        onError(message);
      }
      return;
    }

    if (new Date(formState.startDate) > new Date(formState.endDate)) {
      const message = 'Start date must be before end date.';
      setValidationError(message);
      if (onError) {
        onError(message);
      }
      return;
    }

    await applyFilters(formState);
  };

  const handleQuickSelect = (days: number) => {
    const rangeSelection = getQuickRange(days);
    setFormState((prev) => ({ ...prev, ...rangeSelection }));
    setValidationError(null);
  };

  const handleReset = () => {
    setFormState(appliedFilters);
    setValidationError(null);
  };

  const effectiveCategory = categoryFilter ?? 'All categories';
  const filtersIncludeDeleted = formState.includeDeleted;

  const handleDelete = async (transaction: AdminTransaction) => {
    if (transaction.isDeleted) {
      return;
    }

    const confirmed = window.confirm('Mark this transaction as deleted? This will remove it from sales metrics.');
    if (!confirmed) {
      return;
    }

    try {
      setPendingDeleteId(transaction.id);
      await deleteTransaction(transaction.id);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete transaction.';
      if (onError) {
        onError(message);
      }
      setValidationError(message);
    } finally {
      setPendingDeleteId(null);
    }
  };

  const renderTransaction = (transaction: AdminTransaction) => {
    const createdAt = timestampFormatter.format(new Date(transaction.createdAt));
    const lineItemTotal = transaction.lineItems.reduce((sum, item) => sum + item.quantity, 0);
    const formattedItems = numberFormatter.format(lineItemTotal);
    const deletedAt = transaction.deletedAt ? timestampFormatter.format(new Date(transaction.deletedAt)) : null;
    const cardClassName = transaction.isDeleted ? 'transactions-card transactions-card--deleted' : 'transactions-card';

    return (
      <article key={transaction.id} className={cardClassName}>
        <header className="transactions-card__header">
          <div>
            <p className="transactions-card__reference">Reference {transaction.reference ?? 'N/A'}</p>
            <p className="transactions-card__meta">{createdAt} · {formattedItems} items</p>
          </div>
          <div className="transactions-card__header-meta">
            <div className="transactions-card__amount">{currencyFormatter.format(transaction.totalAmount)}</div>
            <div className="transactions-card__actions">
              {transaction.isDeleted ? (
                <span className="transactions-card__badge">Deleted</span>
              ) : (
                <button
                  type="button"
                  className="transactions-card__delete"
                  onClick={() => handleDelete(transaction)}
                  disabled={pendingDeleteId === transaction.id || isLoading}
                >
                  Flag as deleted
                </button>
              )}
            </div>
          </div>
        </header>
        <dl className="transactions-card__details">
          <div>
            <dt>Status</dt>
            <dd>{transaction.status}</dd>
          </div>
          {transaction.notes ? (
            <div>
              <dt>Notes</dt>
              <dd>{transaction.notes}</dd>
            </div>
          ) : null}
          {transaction.isDeleted ? (
            <div>
              <dt>Deleted</dt>
              <dd>
                {deletedAt ? deletedAt : '—'}
                {transaction.deletedBy ? ` · ${transaction.deletedBy.username}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="transactions-card__body">
          <h4>Line items</h4>
          <table className="transactions-card__table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {transaction.lineItems.map((item) => (
                <tr key={`${transaction.id}-${item.productId}`}>
                  <th scope="row">{item.title}</th>
                  <td>{item.category}</td>
                  <td>{item.quantity}</td>
                  <td>{currencyFormatter.format(item.unitPrice)}</td>
                  <td>{currencyFormatter.format(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="transactions-card__footer">
          <h4>Revenue by category</h4>
          {transaction.categoryBreakdown.length === 0 ? (
            <p className="transactions-empty">No category breakdown available.</p>
          ) : (
            <ul>
              {transaction.categoryBreakdown.map((entry) => (
                <li key={`${transaction.id}-${entry.category}`}>
                  <span className="transactions-card__category">{entry.category}</span>
                  <span>{entry.quantity} items · {currencyFormatter.format(entry.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="transactions-panel">
      <form className="transactions-filters" onSubmit={handleSubmit}>
        <div className="transactions-filters__row">
          <label>
            <span>Start date</span>
            <input
              type="date"
              value={formState.startDate}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, startDate: event.target.value }))
              }
              max={formState.endDate}
            />
          </label>
          <label>
            <span>End date</span>
            <input
              type="date"
              value={formState.endDate}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, endDate: event.target.value }))
              }
              min={formState.startDate}
            />
          </label>
          <label>
            <span>Category</span>
            <select
              value={formState.category ?? ''}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, category: event.target.value || null }))
              }
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="transactions-filters__actions">
          <div className="transactions-filters__quick">
            <button type="button" onClick={() => handleQuickSelect(7)} disabled={isLoading}>
              Last 7 days
            </button>
            <button type="button" onClick={() => handleQuickSelect(30)} disabled={isLoading}>
              Last 30 days
            </button>
            <button type="button" onClick={() => handleQuickSelect(90)} disabled={isLoading}>
              Last 90 days
            </button>
          </div>
          <div className="transactions-filters__submit">
            <button type="button" className="admin-button" onClick={handleReset} disabled={isLoading}>
              Reset
            </button>
            <button type="submit" className="admin-button admin-button--primary" disabled={isLoading}>
              Apply filters
            </button>
          </div>
          <label className="transactions-filters__option">
            <input
              type="checkbox"
              checked={filtersIncludeDeleted}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  includeDeleted: event.target.checked
                }))
              }
              disabled={isLoading}
            />
            <span>Show deleted transactions</span>
          </label>
        </div>
        {validationError ? <p className="transactions-error">{validationError}</p> : null}
        {error ? <p className="transactions-error">{error}</p> : null}
      </form>

      <section className="transactions-summary" aria-live="polite">
        <div>
          <h3>Range</h3>
          <p>
            {range
              ? `${dateFormatter.format(new Date(range.start))} – ${dateFormatter.format(new Date(range.end))}`
              : 'No range selected'}
          </p>
        </div>
        <div>
          <h3>Category</h3>
          <p>{effectiveCategory}</p>
        </div>
        <div>
          <h3>Transactions</h3>
          <p>{numberFormatter.format(transactionCount)}</p>
        </div>
        <div>
          <h3>Items sold</h3>
          <p>{numberFormatter.format(totalItemsSold)}</p>
        </div>
        <div>
          <h3>Revenue</h3>
          <p>{currencyFormatter.format(totalRevenue)}</p>
        </div>
      </section>
      {filtersIncludeDeleted ? (
        <p className="transactions-summary__note">Deleted transactions are highlighted below and remain excluded from totals.</p>
      ) : null}

      <section className="transactions-results" aria-live="polite">
        {isLoading && transactions.length === 0 ? (
          <p className="transactions-empty">Loading transactions…</p>
        ) : null}

        {!isLoading && transactions.length === 0 ? (
          <p className="transactions-empty">No transactions found for this selection.</p>
        ) : null}

        {transactions.length > 0 ? (
          <div className="transactions-list">
            {transactions.map((transaction) => renderTransaction(transaction))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
