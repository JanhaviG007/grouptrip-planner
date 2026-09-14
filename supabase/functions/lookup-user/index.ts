import { withSupabase } from 'npm:@supabase/server'

const isValidUuid = (value: unknown): value is string => {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 },
      )
    }

    let body
    try {
      body = await req.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      )
    }

    const { email, trip_id } = body ?? {}

    if (typeof email !== 'string' || email.trim().length === 0) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 },
      )
    }

    if (!isValidUuid(trip_id)) {
      return Response.json(
        { error: 'Trip ID is required' },
        { status: 400 },
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    const {
      data: { user },
      error: userError,
    } = await ctx.supabase.auth.getUser()

    if (userError || !user) {
      return Response.json(
        { error: 'Not authorized' },
        { status: 403 },
      )
    }

    const { data: trip, error: tripError } = await ctx.supabase
      .from('trips')
      .select('id')
      .eq('id', trip_id)
      .eq('created_by', user.id)
      .maybeSingle()

    if (tripError || !trip) {
      return Response.json(
        { error: 'Not authorized' },
        { status: 403 },
      )
    }

    const { data: listUsersData, error: listUsersError } = await ctx.supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (listUsersError) {
      console.error('Failed to list users:', listUsersError)
      return Response.json(
        { error: 'Unable to search users' },
        { status: 500 },
      )
    }

    const foundUser = listUsersData.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    )

    if (!foundUser) {
      return Response.json(
        { error: 'No registered user found with that email' },
        { status: 404 },
      )
    }

    return Response.json({
      id: foundUser.id,
    })
  }),
}
