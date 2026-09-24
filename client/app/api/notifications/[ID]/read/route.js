import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { expressFetch } from '@/lib/api';

export async function PATCH(_req, { params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await expressFetch(
      `/api/notifications/${encodeURIComponent(params.ID)}/read`,
      { userId: session.user.id, method: 'PATCH' }
    );
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: err.status || 500 }
    );
  }
}
