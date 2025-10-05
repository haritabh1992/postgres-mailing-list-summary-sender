#!/bin/bash

# PostgreSQL Mailing List Summary Sender - Setup Script
# This script sets up the development environment

set -e

echo "🐘 Setting up PostgreSQL Mailing List Summary Sender..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Setup Supabase
echo "🔧 Setting up Supabase..."
cd supabase

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "📥 Installing Supabase CLI..."
    npm install -g supabase
fi

# Initialize Supabase (if not already initialized)
if [ ! -f "config.toml" ]; then
    echo "🚀 Initializing Supabase project..."
    supabase init
fi

# Start Supabase services
echo "🚀 Starting Supabase services..."
supabase start

# Wait for Supabase to be ready
echo "⏳ Waiting for Supabase to be ready..."
sleep 10

# Apply migrations
echo "📊 Applying database migrations..."
supabase db reset

echo "✅ Database setup complete"

# Setup frontend
echo "🎨 Setting up frontend..."
cd ../frontend

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

echo "✅ Frontend setup complete"

# Go back to root
cd ..

# Create .env.local file if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo "📝 Creating .env.local file..."
    cp env.example .env.local
    echo "⚠️  Please edit .env.local with your actual configuration values"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.local with your Supabase and API keys"
echo "2. Run 'npm run dev' to start the development servers"
echo "3. Visit http://localhost:3000 to see the frontend"
echo "4. Visit http://localhost:54323 to access Supabase Studio"
echo ""
echo "Available commands:"
echo "  npm run dev          - Start development servers"
echo "  npm run build        - Build for production"
echo "  npm run db:reset     - Reset database"
echo "  npm run deploy       - Deploy to production"
echo ""
echo "Happy coding! 🚀"
