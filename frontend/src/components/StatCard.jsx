import React from 'react';

const StatCard = ({ title, value, icon: Icon, change, changeType, gradient, subtext }) => {
  const gradients = {
    violet: 'from-violet-500/10 to-indigo-500/2',
    emerald: 'from-emerald-500/10 to-teal-500/2',
    rose: 'from-rose-500/10 to-pink-500/2',
    amber: 'from-amber-500/10 to-orange-500/2',
    blue: 'from-blue-500/10 to-cyan-500/2',
  };

  const borders = {
    violet: 'hover:border-violet-500/30 hover:shadow-violet-500/5',
    emerald: 'hover:border-emerald-500/30 hover:shadow-emerald-500/5',
    rose: 'hover:border-rose-500/30 hover:shadow-rose-500/5',
    amber: 'hover:border-amber-500/30 hover:shadow-amber-500/5',
    blue: 'hover:border-blue-500/30 hover:shadow-blue-500/5',
  };

  const textGradients = {
    violet: 'text-violet-400 bg-violet-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className={`glass-panel glass-panel-hover p-6 flex flex-col justify-between bg-gradient-to-br ${gradients[gradient] || gradients.violet} ${borders[gradient] || borders.violet}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            {title}
          </span>
          <span className="text-2xl lg:text-3xl font-black text-slate-100 tracking-tight block">
            {value}
          </span>
        </div>
        <div className={`p-3 rounded-xl ${textGradients[gradient] || textGradients.violet}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-slate-800/40">
        {change && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center justify-center
            ${changeType === 'increase' 
              ? 'bg-emerald-500/10 text-emerald-400' 
              : 'bg-rose-500/10 text-rose-400'
            }`}
          >
            {changeType === 'increase' ? '+' : ''}{change}
          </span>
        )}
        <span className="text-xs font-medium text-slate-500 truncate">
          {subtext || 'vs last month'}
        </span>
      </div>
    </div>
  );
};

export default StatCard;
