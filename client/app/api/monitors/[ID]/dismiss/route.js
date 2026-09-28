import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { expressFetch } from '@/lib/api';

export async function POST(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await expressFetch(
      `/api/monitors/${encodeURIComponent(params.ID)}/dismiss-drift`,
      { userId: session.user.id, method: 'POST' }
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not discard drift' },
      { status: err.status || 500 }
    );
  }
}
