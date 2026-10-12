import initializeStripe from '@/utils/stripe';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerId } = await params;

  if (!customerId) {
    return NextResponse.json(
      { error: 'Customer ID is required' },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(request.headers);

    // Retrieve the customer data including metadata
    const customer = await stripe.customers.retrieve(customerId);

    if (customer.deleted) {
      return NextResponse.json(
        { error: 'Customer was deleted' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      id: customer.id,
      name: customer.name,
      email: customer.email,
      metadata: customer.metadata,
    });
  } catch (error: unknown) {
    console.error('Error retrieving customer:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Error retrieving customer';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerId } = await params;

  if (!customerId) {
    return NextResponse.json(
      { error: 'Customer ID is required' },
      { status: 400 },
    );
  }

  try {
    const stripe = initializeStripe(request.headers);
    const body = await request.json();
    const { name, address, metadata } = body;

    const updateData: Stripe.CustomerUpdateParams = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (address !== undefined) {
      updateData.address = address;
    }

    if (metadata !== undefined) {
      updateData.metadata = metadata;
    }

    // Don't proceed if there's nothing to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No update data provided' },
        { status: 400 },
      );
    }

    // Update the customer
    const updatedCustomer = await stripe.customers.update(
      customerId,
      updateData,
    );

    return NextResponse.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        address: updatedCustomer.address,
        metadata: updatedCustomer.metadata,
      },
    });
  } catch (error: unknown) {
    console.error('Error updating customer:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Error updating customer';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
