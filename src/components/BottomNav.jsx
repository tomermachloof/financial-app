import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, CreditCard, TrendingUp, Landmark } from 'lucide-react'

const tabs = [
  { to: '/',         Icon: Home,         label: 'בית',      activeColor: 'bg-blue-500',   inactiveColor: 'text-blue-400',   activeBg: 'bg-blue-50'   },
  { to: '/calendar', Icon: CalendarDays, label: 'לוח שנה',  activeColor: 'bg-orange-400', inactiveColor: 'text-orange-400', activeBg: 'bg-orange-50' },
  { to: '/loans',    Icon: CreditCard,   label: 'הלוואות',  activeColor: 'bg-rose-500',   inactiveColor: 'text-rose-400',   activeBg: 'bg-rose-50'   },
  { to: '/income',   Icon: TrendingUp,   label: 'הכנסות',   activeColor: 'bg-emerald-500',inactiveColor: 'text-emerald-500',activeBg: 'bg-emerald-50'},
  { to: '/accounts', Icon: Landmark,     label: 'חשבונות',  activeColor: 'bg-violet-500', inactiveColor: 'text-violet-400', activeBg: 'bg-violet-50' },
]

export default function BottomNav() {
  return (
    <nav className="top-nav bg-gray-50 border-b border-gray-200 z-50 shrink-0 shadow-sm">
      <div className="flex items-stretch">
        {tabs.map(({ to, Icon, label, activeColor, inactiveColor, activeBg }, idx) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5
              ${idx < tabs.length - 1 ? 'border-l border-gray-200' : ''}`}
          >
            {({ isActive }) => (
              <>
                <div className={`rounded-2xl p-2 transition-all ${isActive ? `${activeColor} shadow-md` : activeBg}`}>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={isActive ? 'text-white' : inactiveColor}
                  />
                </div>
                <span className={`text-[10px] font-medium transition-colors ${isActive ? inactiveColor.replace('-400', '-600').replace('-500', '-700') : 'text-gray-400'}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
