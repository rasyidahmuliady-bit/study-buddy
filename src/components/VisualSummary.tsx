import React from 'react';
import { motion } from 'motion/react';
import { Brain, ArrowRight, Layers, GitMerge, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VisualNode {
  label: string;
  description?: string;
  subNodes?: string[];
}

export interface VisualData {
  type: 'mindmap' | 'flow' | 'hierarchy';
  title: string;
  nodes: VisualNode[];
}

interface VisualSummaryProps {
  data: VisualData;
}

export const VisualSummary: React.FC<VisualSummaryProps> = ({ data }) => {
  const renderMindmap = () => (
    <div className="relative py-12 px-4 flex flex-col items-center">
      {/* Central Node */}
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="z-10 bg-primary text-primary-foreground px-8 py-4 rounded-3xl shadow-xl font-black text-center max-w-[200px] border-4 border-white"
      >
        {data.title}
      </motion.div>

      {/* Branches */}
      <div className="mt-12 flex flex-wrap justify-center gap-8 w-full max-w-6xl mx-auto">
        {data.nodes.map((node, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.3 }}
            className="relative bg-white p-8 rounded-[2.5rem] border border-border shadow-sm hover:shadow-md transition-all group flex-1 min-w-[280px] max-w-[400px]"
          >
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary/40 flex items-center justify-center shrink-0 border border-primary/10">
                <GitMerge size={24} />
              </div>
              <div>
                <h4 className="font-black text-lg text-slate-900 mb-2 leading-tight uppercase tracking-tight">{node.label}</h4>
                {node.description && (
                  <p className="text-sm text-slate-500 leading-relaxed mb-4 italic">
                    {node.description}
                  </p>
                )}
                {node.subNodes && node.subNodes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {node.subNodes.map((sn, j) => (
                      <span key={j} className="text-[10px] font-black px-3 py-1 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 uppercase tracking-widest">
                        {sn}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      
      {/* Connector lines (abstract) */}
      <div className="absolute top-[4.5rem] left-1/2 -translate-x-1/2 w-px h-12 bg-primary/20 -z-0 hidden md:block" />
    </div>
  );

  const renderFlow = () => (
    <div className="py-12 px-4 w-full flex flex-col gap-8 items-center max-w-5xl mx-auto">
      {data.nodes.map((node, i) => (
        <React.Fragment key={i}>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="w-full bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm flex items-center gap-8 relative group"
          >
            <div className="w-14 h-14 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-black text-2xl shrink-0 shadow-lg">
              {i + 1}
            </div>
            <div className="flex-1">
              <h4 className="font-black text-lg text-slate-900 mb-2 uppercase tracking-tight">{node.label}</h4>
              {node.description && <p className="text-sm text-slate-500 font-medium leading-relaxed italic">{node.description}</p>}
              {node.subNodes && node.subNodes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {node.subNodes.map((sn, idx) => (
                    <span key={idx} className="bg-primary/5 text-primary text-[10px] font-bold px-2 py-1 rounded-md border border-primary/10">
                      • {sn}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
          {i < data.nodes.length - 1 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 24, opacity: 1 }}
              transition={{ delay: i * 0.1 + 0.05 }}
              className="w-0.5 bg-dashed border-l-2 border-dashed border-primary/30 h-6"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderHierarchy = () => (
    <div className="py-12 px-4 w-full max-w-6xl mx-auto">
      {/* Root */}
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900 text-white px-12 py-6 rounded-3xl shadow-xl font-black text-2xl mb-16 border-4 border-slate-100"
        >
          {data.title}
        </motion.div>
        
        {/* Children Rows */}
        <div className="flex flex-wrap justify-center gap-10 w-full">
          {data.nodes.map((node, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 + 0.2 }}
              className="bg-white rounded-[2.5rem] border border-border shadow-sm p-10 relative overflow-hidden group flex-1 min-w-[300px] max-w-[450px]"
            >
              <div className="absolute top-0 left-0 w-2 h-full bg-primary/20" />
              <div className="absolute top-6 right-8 p-2 bg-slate-50 rounded-xl">
                <Layers size={22} className="text-primary/40" />
              </div>
              <h4 className="font-black text-xl text-slate-900 mb-4 uppercase tracking-tighter">{node.label}</h4>
              <p className="text-sm text-slate-500 font-medium mb-8 leading-relaxed italic">{node.description}</p>
              
              {node.subNodes && (
                <ul className="space-y-1.5">
                  {node.subNodes.map((sn, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-[10px] text-slate-600 font-bold bg-slate-50 p-2 rounded-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                      {sn}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="my-12 rounded-[2.5rem] bg-slate-50/50 border border-slate-200/60 overflow-hidden relative"
    >
      <div className="bg-white/80 backdrop-blur-sm px-8 py-5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl text-primary">
            <Brain size={20} />
          </div>
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900">Visual Learning Summary</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
              {data.type} visualization for deeper retention
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase bg-slate-100/50 px-3 py-1.5 rounded-full">
          <Info size={12} />
          Scannable Layout
        </div>
      </div>

      <div className="p-2 md:p-8">
        {data.type === 'mindmap' && renderMindmap()}
        {data.type === 'flow' && renderFlow()}
        {data.type === 'hierarchy' && renderHierarchy()}
      </div>

      <div className="bg-primary/5 px-8 py-3 flex items-center gap-2">
         <ArrowRight size={14} className="text-primary" />
         <p className="text-[10px] font-bold text-primary/70 uppercase italic tracking-tight">
           Tip: Use this visual to recall relationships before taking the quiz.
         </p>
      </div>
    </motion.div>
  );
};
