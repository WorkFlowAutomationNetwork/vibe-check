'use client'

export default function DeleteAccountForm({ userId }: { userId: string }) {
  return (
    <form
      method="POST"
      action={`/api/admin/users/${userId}`}
      onSubmit={(e) => {
        if (!confirm('Delete this account permanently? This cannot be undone.')) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="_method" value="DELETE" />
      <button type="submit" className="btn-admin danger">
        Delete account
      </button>
    </form>
  )
}
