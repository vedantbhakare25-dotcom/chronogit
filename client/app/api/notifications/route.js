import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../auth/[...nextauth]/route';
import { expressFetch } from '@/lib/api';

async function getUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

function apiError(err) {
  return NextResponse.json(
    { error: err.message || 'Internal server error' },
    { status: err.status || 500 }
  );
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await expressFetch('/api/notifications', { userId });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await expressFetch('/api/notifications/mark-all-read', { userId, method: 'POST' });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}
