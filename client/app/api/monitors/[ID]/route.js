import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../../auth/[...nextauth]/route';
import { expressFetch } from '@/lib/api';

async function getUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

function apiError(err) {
  return NextResponse.json(
    { error: err.message || 'Internal server error', ...(err.details !== undefined ? { details: err.details } : {}) },
    { status: err.status || 500 }
  );
}

export async function GET(_req, { params }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await expressFetch(`/api/monitors/${encodeURIComponent(params.ID)}`, { userId });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req, { params }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = await expressFetch(`/api/monitors/${encodeURIComponent(params.ID)}`, {
      userId, method: 'PUT', body: await req.json(),
    });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req, { params }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await expressFetch(`/api/monitors/${encodeURIComponent(params.ID)}`, { userId, method: 'DELETE' });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return apiError(err);
  }
}
