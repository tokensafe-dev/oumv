package repository

import (
	"context"
	"database/sql"
	"fmt"
	"ecommerce-app/backend/internal/domain"
)

type OrderRepository interface {
	CreateOrderWithItems(ctx context.Context, order *domain.Order) error
	GetOrderByID(ctx context.Context, orderID string) (*domain.Order, error)
}

type PostgresOrderRepository struct {
	db *sql.DB
}

func NewPostgresOrderRepository(db *sql.DB) *PostgresOrderRepository {
	return &PostgresOrderRepository{db: db}
}

func (r *PostgresOrderRepository) CreateOrderWithItems(ctx context.Context, order *domain.Order) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	// Scenario 2 target SQL query
	const insertOrderSQL = `
		INSERT INTO orders (id, customer_id, status, payment_method, phone, total_cents, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = tx.ExecContext(ctx, insertOrderSQL,
		order.ID,
		order.CustomerID,
		order.Status,
		order.PaymentMethod,
		order.Phone,
		order.TotalCents,
		order.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert order: %w", err)
	}

	const insertItemSQL = `
		INSERT INTO order_items (order_id, sku, name, price_cents, quantity)
		VALUES ($1, $2, $3, $4, $5)
	`
	for _, item := range order.Items {
		_, err = tx.ExecContext(ctx, insertItemSQL,
			order.ID,
			item.SKU,
			item.Name,
			item.PriceCents,
			item.Quantity,
		)
		if err != nil {
			return fmt.Errorf("failed to insert order item %s: %w", item.SKU, err)
		}
	}

	return tx.Commit()
}

func (r *PostgresOrderRepository) GetOrderByID(ctx context.Context, orderID string) (*domain.Order, error) {
	const query = `
		SELECT id, customer_id, status, payment_method, phone, total_cents, created_at
		FROM orders WHERE id = $1
	`
	row := r.db.QueryRowContext(ctx, query, orderID)
	var o domain.Order
	err := row.Scan(&o.ID, &o.CustomerID, &o.Status, &o.PaymentMethod, &o.Phone, &o.TotalCents, &o.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &o, nil
}
