package service

import (
	"context"
	"fmt"
	"time"
	"ecommerce-app/backend/internal/domain"
	"ecommerce-app/backend/internal/repository"
)

type OrderService struct {
	repo repository.OrderRepository
}

func NewOrderService(repo repository.OrderRepository) *OrderService {
	return &OrderService{repo: repo}
}

func (s *OrderService) ProcessCheckout(ctx context.Context, req domain.CheckoutDTO) (*domain.Order, error) {
	if req.CustomerID == "" {
		return nil, fmt.Errorf("customer_id is required")
	}
	if req.Phone == "" {
		return nil, fmt.Errorf("phone is required")
	}

	orderID := fmt.Sprintf("ord_%d", time.Now().UnixNano())
	order := &domain.Order{
		ID:            orderID,
		CustomerID:    req.CustomerID,
		Status:        "confirmed",
		PaymentMethod: req.PaymentMethod,
		Phone:         req.Phone,
		TotalCents:    4999, // mocked total: $49.99
		CreatedAt:     time.Now().UTC(),
		Items: []domain.OrderItem{
			{
				OrderID:    orderID,
				SKU:        "SKU-PRO-AUDIO",
				Name:       "Wireless ANC Headphones",
				PriceCents: 4999,
				Quantity:   1,
			},
		},
	}

	if err := s.repo.CreateOrderWithItems(ctx, order); err != nil {
		return nil, fmt.Errorf("failed to persist order: %w", err)
	}

	return order, nil
}
